import { describe, expect, it } from 'vitest';
import type { LonLat } from '../map/geo';
import { trackPreview } from './trackPreview';

describe('trackPreview', () => {
  it('keeps short tracks as they are, joining segments', () => {
    const a: LonLat[] = [
      [0, 0],
      [1, 1],
    ];
    expect(trackPreview([a, [[2, 2]]])).toEqual([...a, [2, 2]]);
  });

  it('thins long tracks to evenly spaced points, keeping the start and end', () => {
    const long: LonLat[] = Array.from({ length: 1000 }, (_, i) => [i, i]);
    const preview = trackPreview([long], 10);
    expect(preview).toHaveLength(10);
    expect(preview[0]).toEqual([0, 0]);
    expect(preview[9]).toEqual([999, 999]);
  });
});
