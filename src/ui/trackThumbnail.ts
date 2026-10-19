import type { LonLat } from '../map/geo';

const SIZE = 56;
const PADDING = 6;
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A small drawing of a hike's shape for the history list. It's a simple flat
 * projection (longitude squeezed by cos(latitude), like on a real map), which
 * is accurate enough at the size of one hike, and needs no map tiles.
 */
export function trackThumbnail(points: readonly LonLat[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute('class', 'track-thumb');
  svg.setAttribute('aria-hidden', 'true');
  if (points.length < 2) return svg;

  const midLat = (Math.min(...points.map((p) => p[1])) + Math.max(...points.map((p) => p[1]))) / 2;
  const squeeze = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map(([lon]) => lon * squeeze);
  const ys = points.map(([, lat]) => -lat); // Screen y grows downwards; north is up.
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = (SIZE - 2 * PADDING) / Math.max(maxX - minX, maxY - minY, 1e-9);
  // Centre the shape in the square.
  const offsetX = (SIZE - (maxX - minX) * scale) / 2;
  const offsetY = (SIZE - (maxY - minY) * scale) / 2;

  const path = document.createElementNS(SVG_NS, 'polyline');
  path.setAttribute(
    'points',
    xs.map((x, i) => `${((x - minX) * scale + offsetX).toFixed(1)},${((ys[i] - minY) * scale + offsetY).toFixed(1)}`).join(' '),
  );
  svg.append(path);
  return svg;
}
