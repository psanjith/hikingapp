import type { LonLat } from './geo';

export interface FittedTrack {
  /** Each segment as [x, y] pixel points, north up. */
  segments: [number, number][][];
  /** Size of the drawn shape itself (it's centred in the box). */
  width: number;
  height: number;
}

/**
 * Fits a track's shape into a width × height box (keeping its proportions,
 * centred, with padding) for drawing outside a map: list thumbnails and
 * share images.
 *
 * A simple flat projection: longitude is squeezed by cos(latitude), as on a
 * real map, which is accurate at the size of one hike.
 */
export function fitTrack(
  segments: readonly (readonly LonLat[])[],
  box: { width: number; height: number; padding: number },
): FittedTrack {
  const points = segments.flat();
  if (points.length === 0) return { segments: [], width: 0, height: 0 };

  const lats = points.map((p) => p[1]);
  const squeeze = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const project = ([lon, lat]: LonLat): [number, number] => [lon * squeeze, -lat]; // Screen y grows downwards.

  const projected = points.map(project);
  const xs = projected.map((p) => p[0]);
  const ys = projected.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min(
    (box.width - 2 * box.padding) / Math.max(spanX, 1e-12),
    (box.height - 2 * box.padding) / Math.max(spanY, 1e-12),
  );
  const width = spanX * scale;
  const height = spanY * scale;
  const offsetX = (box.width - width) / 2;
  const offsetY = (box.height - height) / 2;

  return {
    segments: segments.map((segment) =>
      segment.map((p) => {
        const [x, y] = project(p);
        return [(x - minX) * scale + offsetX, (y - minY) * scale + offsetY];
      }),
    ),
    width,
    height,
  };
}
