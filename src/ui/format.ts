/** "59 MB", "1.2 GB": plain-language sizes for download buttons. */
export function formatBytes(bytes: number): string {
  if (bytes < 1e6) return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  if (bytes < 1e9) return `${Math.round(bytes / 1e6)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/** "20261018" → "Oct 18, 2026". */
export function formatMapVersion(version: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(version);
  if (!match) return version;
  const [, y, m, d] = match.map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "850 m", "2.9 km": plain-language distances, precise enough for a trail sign. */
export function formatDistance(meters: number): string {
  if (meters < 995) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** "0:42", "12:05", "1:02:11": a stopwatch-style duration. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

const COMPASS_POINTS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];

/** 76 → "East": the nearest of the eight compass points, in plain words. */
export function compassPoint(degrees: number): string {
  return COMPASS_POINTS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

/**
 * "49.32961° N, 122.94890° W": the format to read out to 911 or Search and
 * Rescue. Five decimal places is about 1 m, finer than phone GPS anyway.
 */
export function formatCoordinates(lat: number, lon: number): string {
  const part = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(5)}° ${value >= 0 ? positive : negative}`;
  return `${part(lat, 'N', 'S')}, ${part(lon, 'E', 'W')}`;
}

/** "5:42 p.m.": a time of day, in the phone's own time zone. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

/** "1 h 10 min", "25 min": how long until something. */
export function formatTimeLeft(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}
