/**
 * Background download of one map region into the Origin Private File System.
 *
 * Why a Web Worker: OPFS "sync access handles" are the fastest way to write a
 * large file, and the one write API that Safari has supported for years, but
 * browsers only allow them inside workers. It also keeps a several-hundred-MB
 * download from making the map stutter.
 *
 * Why it can resume: phones lose connection, and iOS suspends web apps when
 * they're backgrounded. Bytes already written stay on disk, so the next attempt
 * asks the server only for the rest (an HTTP Range request).
 */
import { classifyDownloadError, type DownloadRequest, type DownloadWorkerMessage } from './downloadProtocol';

/** The parts of FileSystemSyncAccessHandle we use (not in TypeScript's DOM types). */
interface SyncAccessHandle {
  getSize(): number;
  truncate(size: number): void;
  write(data: Uint8Array, options: { at: number }): number;
  flush(): void;
  close(): void;
}

interface SyncAccessFileHandle {
  createSyncAccessHandle(): Promise<SyncAccessHandle>;
}

const PROGRESS_INTERVAL_MS = 250;
const MAPS_DIR = 'maps';

const post = (message: DownloadWorkerMessage) => self.postMessage(message);
const abort = new AbortController();

self.onmessage = (event: MessageEvent<DownloadRequest | { type: 'cancel' }>) => {
  const message = event.data;
  if (message.type === 'cancel') abort.abort();
  else void download(message);
};

async function download({ url, fileName, expectedBytes }: DownloadRequest): Promise<void> {
  let handle: SyncAccessHandle | null = null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(MAPS_DIR, { create: true });
    const file = await dir.getFileHandle(fileName, { create: true });
    handle = await (file as unknown as SyncAccessFileHandle).createSyncAccessHandle();

    let offset = handle.getSize();
    if (offset > expectedBytes) {
      handle.truncate(0);
      offset = 0;
    }

    if (offset < expectedBytes) {
      const response = await fetch(url, {
        headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
        signal: abort.signal,
      });

      // 200 to a Range request means the server sent the whole file instead,
      // so start again from the beginning rather than appending.
      if (offset > 0 && response.status === 200) {
        handle.truncate(0);
        offset = 0;
      }
      if (!response.ok || !response.body) {
        post({ type: 'error', kind: 'network', message: `Server responded ${response.status}` });
        return;
      }

      const reader = response.body.getReader();
      let lastProgress = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        handle.write(value, { at: offset });
        offset += value.byteLength;

        const now = Date.now();
        if (now - lastProgress > PROGRESS_INTERVAL_MS) {
          lastProgress = now;
          post({ type: 'progress', receivedBytes: offset });
        }
      }
      handle.flush();
    }

    // Never mark a region usable unless every byte arrived.
    if (offset !== expectedBytes) {
      post({
        type: 'error',
        kind: 'incomplete',
        message: `Got ${offset} of ${expectedBytes} bytes`,
      });
      return;
    }
    post({ type: 'done', receivedBytes: offset });
  } catch (error) {
    post({ type: 'error', ...classifyDownloadError(error) });
  } finally {
    handle?.close();
  }
}
