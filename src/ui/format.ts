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
