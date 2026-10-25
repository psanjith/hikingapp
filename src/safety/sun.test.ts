import { describe, expect, it } from 'vitest';
import { sunriseTime, sunsetTime } from './sun';

const VANCOUVER = { lat: 49.2827, lon: -123.1207 };

/** Pacific time of a timestamp, as "HH:MM" (fixed offset, so the test doesn't depend on the machine's zone). */
function pacific(ms: number, offsetHours: number): string {
  const d = new Date(ms + offsetHours * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function minutesApart(a: string, b: string): number {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return Math.abs(toMin(a) - toMin(b));
}

describe('sunsetTime', () => {
  // Published Vancouver, BC times: earliest and latest sunsets of 2026 (sunrisesunset.io,
  // in standard / daylight time respectively) and an October date (sunrisesunsettime.org).
  // Compared as exact moments, so B.C.'s time-zone rules don't matter here.
  it.each([
    ['earliest sunset (Dec 12)', 2026, 11, 12, -8, '16:14'],
    ['latest sunset (Jun 25)', 2026, 5, 25, -7, '21:23'],
    ['autumn (Oct 9)', 2026, 9, 9, -7, '18:34'],
  ])('matches the published %s', (_, year, month, day, offset, published) => {
    // Noon UTC on that date is the same calendar day in Vancouver.
    const sunset = sunsetTime(new Date(year, month, day, 12), VANCOUVER.lat, VANCOUVER.lon)!;
    expect(minutesApart(pacific(sunset, offset), published)).toBeLessThanOrEqual(3);
  });

  it('puts sunrise before sunset', () => {
    const day = new Date(2026, 9, 24, 12);
    expect(sunriseTime(day, VANCOUVER.lat, VANCOUVER.lon)!).toBeLessThan(sunsetTime(day, VANCOUVER.lat, VANCOUVER.lon)!);
  });

  it('returns null where the sun never sets', () => {
    expect(sunsetTime(new Date(2026, 5, 21, 12), 78.2, 15.6)).toBeNull(); // Svalbard in June.
  });
});
