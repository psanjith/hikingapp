import { fitTrack } from '../map/fitTrack';
import type { LonLat } from '../map/geo';

export interface ShareImageOptions {
  /** White shows up on most photos; black for bright scenes like snow or sky. */
  color: 'white' | 'black';
  /** Distance, time and (when known) climb under the route. */
  showStats: boolean;
}

export interface ShareStats {
  distance: string;
  time: string;
  /** Total climb, e.g. "240 m"; left off the image when unknown. */
  climb?: string;
}

/** Instagram stories are 1080 px wide, so the sticker is drawn at that width. */
const WIDTH = 1080;
const PADDING = 90;
const LINE_WIDTH = 16;
const STATS_HEIGHT = 300;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * Draws a hike as a transparent PNG "sticker": the route's shape plus,
 * optionally, distance and time. The background is left fully transparent,
 * so it can be laid over a photo in an Instagram story.
 *
 * The line and text get a soft shadow in the opposite colour, so they stay
 * readable whatever photo they're placed on.
 */
export async function renderShareImage(
  segments: readonly (readonly LonLat[])[],
  stats: ShareStats,
  options: ShareImageOptions,
): Promise<Blob> {
  // The route gets at most a square; long thin hikes make a shorter image.
  const fitted = fitTrack(segments, { width: WIDTH, height: WIDTH, padding: PADDING });
  const routeHeight = Math.max(fitted.height, LINE_WIDTH) + 2 * PADDING;
  const height = Math.round(routeHeight + (options.showStats ? STATS_HEIGHT : 0));

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const ink = options.color === 'white' ? '#ffffff' : '#111111';
  ctx.shadowColor = options.color === 'white' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.6)';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  // fitTrack centres the shape in a WIDTH × WIDTH square; shift it up into the route area.
  const shiftY = (routeHeight - WIDTH) / 2;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const segment of fitted.segments) {
    ctx.beginPath();
    segment.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y + shiftY) : ctx.lineTo(x, y + shiftY)));
    ctx.stroke();
  }

  // A filled dot where the hike started.
  const start = fitted.segments[0]?.[0];
  if (start) {
    ctx.beginPath();
    ctx.arc(start[0], start[1] + shiftY, LINE_WIDTH * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (options.showStats) {
    const top = routeHeight;
    ctx.textAlign = 'center';
    const columns: [string, string][] = [
      [stats.distance, 'Distance'],
      [stats.time, 'Time'],
      ...(stats.climb ? [[stats.climb, 'Climb'] as [string, string]] : []),
    ];
    // Two columns get big numbers; three need to be a bit smaller to fit.
    const valueSize = columns.length === 3 ? 84 : 104;
    columns.forEach(([value, label], i) => {
      const centreX = (WIDTH * (2 * i + 1)) / (2 * columns.length);
      ctx.font = `800 ${valueSize}px ${FONT}`;
      ctx.fillText(value, centreX, top + 120);
      ctx.font = `600 40px ${FONT}`;
      ctx.fillText(label, centreX, top + 180);
    });
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create image'))), 'image/png'),
  );
}
