/**
 * Sunset (and sunrise) times from a position and date, using NOAA's general
 * solar position equations. Accurate to about a minute at BC latitudes,
 * computed on the phone, so it works with no signal.
 *
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 */

const DEG = Math.PI / 180;
/** The sun's centre is 0.833° below the horizon at "sunset" (refraction + the sun's radius). */
const SUNSET_ZENITH = 90.833 * DEG;

/**
 * When the sun sets on the given day, at the given place, as a Unix
 * timestamp (ms). "The given day" is the calendar day of `day` in the phone's
 * own time zone. Returns null where the sun doesn't set (polar summer) or
 * doesn't rise (polar winter).
 */
export function sunsetTime(day: Date, lat: number, lon: number): number | null {
  return sunEvent(day, lat, lon, 'set');
}

export function sunriseTime(day: Date, lat: number, lon: number): number | null {
  return sunEvent(day, lat, lon, 'rise');
}

function sunEvent(day: Date, lat: number, lon: number, event: 'rise' | 'set'): number | null {
  // The local calendar day, as midnight UTC of the same date: NOAA's formula
  // gives minutes after UTC midnight (which can run past 24 h for the Americas).
  const utcMidnight = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  const dayOfYear = Math.round((utcMidnight - Date.UTC(day.getFullYear(), 0, 1)) / 86_400_000) + 1;
  const daysInYear = isLeapYear(day.getFullYear()) ? 366 : 365;

  // Fractional year (radians), taken at local solar noon of that day.
  const noonUtcHours = 12 - lon / 15;
  const g = ((2 * Math.PI) / daysInYear) * (dayOfYear - 1 + (noonUtcHours - 12) / 24);

  const equationOfTime =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const declination =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);

  const cosHourAngle =
    Math.cos(SUNSET_ZENITH) / (Math.cos(lat * DEG) * Math.cos(declination)) - Math.tan(lat * DEG) * Math.tan(declination);
  if (cosHourAngle < -1 || cosHourAngle > 1) return null; // Midnight sun or polar night.
  const hourAngle = Math.acos(cosHourAngle) / DEG;

  const minutes = 720 - 4 * (lon + (event === 'rise' ? hourAngle : -hourAngle)) - equationOfTime;
  return utcMidnight + minutes * 60_000;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
