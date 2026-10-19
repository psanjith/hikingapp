import { describe, expect, it } from 'vitest';
import { formatBytes, formatDistance, formatMapVersion } from './format';

describe('formatBytes', () => {
  it('uses whole units under a gigabyte', () => {
    expect(formatBytes(59_341_973)).toBe('59 MB');
    expect(formatBytes(512_000)).toBe('512 KB');
  });

  it('shows one decimal for gigabytes', () => {
    expect(formatBytes(951_000_000)).toBe('951 MB');
    expect(formatBytes(1_900_000_000)).toBe('1.9 GB');
  });

  it('never shows 0 KB for a non-empty file', () => {
    expect(formatBytes(10)).toBe('1 KB');
  });
});

describe('formatMapVersion', () => {
  it('turns a build date into a readable date', () => {
    expect(formatMapVersion('20261018')).toBe('Oct 18, 2026');
  });

  it('passes through anything unexpected', () => {
    expect(formatMapVersion('latest')).toBe('latest');
  });
});

describe('formatDistance', () => {
  it('uses metres for short distances, rounded to 10 m', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(847)).toBe('850 m');
  });

  it('switches to kilometres with one decimal, without ever showing "1000 m"', () => {
    expect(formatDistance(996)).toBe('1.0 km');
    expect(formatDistance(2_870)).toBe('2.9 km');
    expect(formatDistance(21_100)).toBe('21.1 km');
  });
});
