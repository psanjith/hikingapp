import { fitTrack } from '../map/fitTrack';
import type { LonLat } from '../map/geo';

const SIZE = 56;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** A small drawing of a hike's shape for the history list (no map tiles needed). */
export function trackThumbnail(points: readonly LonLat[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute('class', 'track-thumb');
  svg.setAttribute('aria-hidden', 'true');
  if (points.length < 2) return svg;

  const [line] = fitTrack([points], { width: SIZE, height: SIZE, padding: 6 }).segments;
  const path = document.createElementNS(SVG_NS, 'polyline');
  path.setAttribute('points', line.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
  svg.append(path);
  return svg;
}
