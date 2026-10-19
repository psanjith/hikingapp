/** Messages between the app and the download worker. */

export interface DownloadRequest {
  type: 'start';
  url: string;
  fileName: string;
  expectedBytes: number;
}

/**
 * Why a download stopped. 'network' and 'incomplete' can be resumed; 'storage'
 * means the browser refused to let us save files at all (e.g. Safari Private
 * Browsing), so retrying won't help.
 */
export type DownloadErrorKind = 'quota' | 'network' | 'incomplete' | 'cancelled' | 'storage';

export type DownloadWorkerMessage =
  | { type: 'progress'; receivedBytes: number }
  | { type: 'done'; receivedBytes: number }
  | { type: 'error'; kind: DownloadErrorKind; message: string };

/** Sorts an exception thrown during a download into one of the kinds above. */
export function classifyDownloadError(error: unknown): { kind: DownloadErrorKind; message: string } {
  const name = (error as { name?: unknown } | null)?.name;
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'QuotaExceededError') return { kind: 'quota', message };
  if (name === 'AbortError') return { kind: 'cancelled', message };
  // Browsers report a failed or dropped fetch as a TypeError. Everything else
  // (e.g. Safari's "UnknownError" when OPFS is unavailable) comes from storage.
  if (error instanceof TypeError) return { kind: 'network', message };
  return { kind: 'storage', message: `${String(name ?? 'Error')}: ${message}` };
}
