import { describe, expect, it } from 'vitest';
import { classifyDownloadError } from './downloadProtocol';

describe('classifyDownloadError', () => {
  it('treats a failed fetch as a resumable network error', () => {
    expect(classifyDownloadError(new TypeError('Load failed')).kind).toBe('network');
  });

  it('recognises a full disk and a user cancel', () => {
    expect(classifyDownloadError(new DOMException('full', 'QuotaExceededError')).kind).toBe('quota');
    expect(classifyDownloadError(new DOMException('stop', 'AbortError')).kind).toBe('cancelled');
  });

  it('reports storage failures as storage, not as an interrupted download', () => {
    // What Safari throws from navigator.storage.getDirectory() in Private Browsing.
    const result = classifyDownloadError(new DOMException('The operation failed', 'UnknownError'));
    expect(result.kind).toBe('storage');
    expect(result.message).toContain('UnknownError');
  });
});
