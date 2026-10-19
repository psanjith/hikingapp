import { getDb } from '../storage/db';
import type { DownloadErrorKind, DownloadRequest, DownloadWorkerMessage } from './downloadProtocol';
import type { RegionInfo, StoredRegion } from './types';

const MAPS_DIR = 'maps';
/** Leave headroom: storage estimates are approximate, and the OS needs space too. */
const SPACE_SAFETY_MARGIN = 1.1;

export type MapDownloadErrorKind = DownloadErrorKind | 'insufficient-space';

export class MapDownloadError extends Error {
  constructor(
    readonly kind: MapDownloadErrorKind,
    message: string,
    /** For 'insufficient-space': bytes needed and bytes available. */
    readonly space?: { neededBytes: number; freeBytes: number },
  ) {
    super(message);
  }
}

export interface StorageSummary {
  /** Total bytes this app is using on the device (maps + everything else). */
  usedBytes: number;
  /** Roughly how much more the browser will let us store, if it says. */
  freeBytes: number | null;
  /** Whether the browser promised not to auto-delete our data. */
  persisted: boolean;
}

/**
 * Where downloaded map regions live on the device.
 *
 * The app only talks to this interface. The implementation below uses OPFS +
 * IndexedDB; a native build (Capacitor) could store files in the app's own
 * folder instead without the map or UI code changing.
 */
export interface MapFileStore {
  list(): Promise<StoredRegion[]>;
  openFile(region: StoredRegion): Promise<File>;
  /** Bytes already saved from an interrupted download of this exact version. */
  partialBytes(info: RegionInfo): Promise<number>;
  download(
    info: RegionInfo,
    onProgress: (receivedBytes: number) => void,
    signal?: AbortSignal,
  ): Promise<StoredRegion>;
  remove(id: string): Promise<void>;
  storageSummary(): Promise<StorageSummary>;
}

export function createOpfsMapFileStore(): MapFileStore {
  const mapsDir = async () =>
    (await navigator.storage.getDirectory()).getDirectoryHandle(MAPS_DIR, { create: true });

  async function fileSize(fileName: string): Promise<number> {
    try {
      const handle = await (await mapsDir()).getFileHandle(fileName);
      return (await handle.getFile()).size;
    } catch {
      return 0;
    }
  }

  async function deleteFile(fileName: string): Promise<void> {
    try {
      await (await mapsDir()).removeEntry(fileName);
    } catch {
      // Already gone.
    }
  }

  /** Deletes every file belonging to a region except `keep` (old versions, partials). */
  async function deleteRegionFiles(id: string, keep?: string): Promise<void> {
    const dir = await mapsDir();
    const names: string[] = [];
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
      if (name.startsWith(`${id}--`) && name !== keep) names.push(name);
    }
    await Promise.all(names.map(deleteFile));
  }

  async function ensureSpace(neededBytes: number): Promise<void> {
    const { quota, usage } = await navigator.storage.estimate();
    if (quota === undefined || usage === undefined) return; // Browser won't say; just try.
    const freeBytes = quota - usage;
    if (freeBytes < neededBytes * SPACE_SAFETY_MARGIN) {
      throw new MapDownloadError('insufficient-space', 'Not enough storage space', {
        neededBytes,
        freeBytes,
      });
    }
  }

  return {
    async list() {
      return (await getDb()).getAll('regions');
    },

    async openFile(region) {
      const handle = await (await mapsDir()).getFileHandle(region.fileName);
      return handle.getFile();
    },

    async partialBytes(info) {
      const stored = await (await getDb()).get('regions', info.id);
      if (stored?.version === info.version) return 0; // Already complete.
      return fileSize(fileNameFor(info));
    },

    async download(info, onProgress, signal) {
      const fileName = fileNameFor(info);
      const alreadySaved = await fileSize(fileName);
      await ensureSpace(info.bytes - alreadySaved);

      // Ask the browser not to clear our data when the device is low on
      // space. Safari is stricter for sites not added to the Home Screen.
      await navigator.storage.persist?.();

      try {
        await runWorker({ type: 'start', url: info.url, fileName, expectedBytes: info.bytes }, onProgress, signal);
      } catch (error) {
        // Keep partial bytes after a dropped connection so we can resume, but
        // free the space if the disk is full or the user cancelled.
        if (error instanceof MapDownloadError && (error.kind === 'quota' || error.kind === 'cancelled')) {
          await deleteFile(fileName);
        }
        throw error;
      }

      const region: StoredRegion = {
        id: info.id,
        name: info.name,
        version: info.version,
        bounds: info.bounds,
        bytes: info.bytes,
        fileName,
        downloadedAt: Date.now(),
      };
      await (await getDb()).put('regions', region);
      // Only now, with the new version safely recorded, remove the old one.
      await deleteRegionFiles(info.id, fileName);
      return region;
    },

    async remove(id) {
      await (await getDb()).delete('regions', id);
      await deleteRegionFiles(id);
    },

    async storageSummary() {
      const { quota, usage } = await navigator.storage.estimate();
      return {
        usedBytes: usage ?? 0,
        freeBytes: quota !== undefined && usage !== undefined ? quota - usage : null,
        persisted: (await navigator.storage.persisted?.()) ?? false,
      };
    },
  };
}

/** e.g. "lower-mainland--20261018.pmtiles" (double dash: ids contain dashes). */
function fileNameFor(info: RegionInfo): string {
  return `${info.id}--${info.version}.pmtiles`;
}

function runWorker(
  request: DownloadRequest,
  onProgress: (receivedBytes: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./downloadWorker.ts', import.meta.url), { type: 'module' });
    const onAbort = () => worker.postMessage({ type: 'cancel' });
    signal?.addEventListener('abort', onAbort, { once: true });

    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<DownloadWorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress(message.receivedBytes);
      } else if (message.type === 'done') {
        onProgress(message.receivedBytes);
        finish();
        resolve();
      } else {
        finish();
        reject(new MapDownloadError(message.kind, message.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new MapDownloadError('network', event.message || 'Download worker failed'));
    };

    worker.postMessage(request);
  });
}
