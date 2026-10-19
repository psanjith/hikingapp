/** Messages between the app and the download worker. */

export interface DownloadRequest {
  type: 'start';
  url: string;
  fileName: string;
  expectedBytes: number;
}

export type DownloadErrorKind = 'quota' | 'network' | 'incomplete' | 'cancelled';

export type DownloadWorkerMessage =
  | { type: 'progress'; receivedBytes: number }
  | { type: 'done'; receivedBytes: number }
  | { type: 'error'; kind: DownloadErrorKind; message: string };
