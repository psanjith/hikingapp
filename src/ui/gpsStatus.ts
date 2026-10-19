import { GPS_FAIR_ACCURACY_M, GPS_GOOD_ACCURACY_M } from '../config';
import type { LocationErrorKind, LocationFix } from '../location/types';

type Tone = 'good' | 'fair' | 'poor' | 'off';

/** Plain-language explanations; no jargon like "PERMISSION_DENIED". */
const ERROR_HELP: Record<LocationErrorKind, { chip: string; detail: string }> = {
  'permission-denied': {
    chip: 'Location off',
    detail:
      'This app needs your location to show where you are. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → "While Using the App". Then reopen this app.',
  },
  unavailable: {
    chip: 'No GPS',
    detail:
      "Can't get a GPS signal right now. Move somewhere with open sky, away from cliffs and dense trees.",
  },
  timeout: {
    chip: 'Searching…',
    detail: 'Still looking for a GPS signal. This can take a minute under heavy tree cover.',
  },
  unsupported: {
    chip: 'No GPS',
    detail: "This browser can't access your location. Try Safari on iPhone or Chrome on Android.",
  },
};

/**
 * The small "GPS: Good ±8 m" chip at the top of the screen, plus a banner
 * with a fix-it explanation when something goes wrong.
 */
export class GpsStatus {
  private hasFix = false;

  constructor(
    private readonly chip: HTMLElement,
    private readonly banner: HTMLElement,
  ) {
    this.render('off', 'Finding you…');
  }

  showFix(fix: LocationFix, stale: boolean): void {
    this.hasFix = true;
    this.hideBanner();

    if (stale) {
      this.render('poor', 'GPS lost');
      return;
    }

    const metres = Math.round(fix.accuracy);
    if (fix.accuracy <= GPS_GOOD_ACCURACY_M) this.render('good', `GPS good · ±${metres} m`);
    else if (fix.accuracy <= GPS_FAIR_ACCURACY_M) this.render('fair', `GPS okay · ±${metres} m`);
    else this.render('poor', `GPS weak · ±${metres} m`);
  }

  showError(kind: LocationErrorKind): void {
    // A timeout after we've already had a fix just means one reading was slow;
    // the stale-dot logic handles that case, so don't alarm the user.
    if (kind === 'timeout' && this.hasFix) return;

    const help = ERROR_HELP[kind];
    this.render(kind === 'timeout' ? 'fair' : 'off', help.chip);
    this.banner.textContent = help.detail;
    this.banner.hidden = false;
  }

  private hideBanner(): void {
    this.banner.hidden = true;
  }

  private render(tone: Tone, text: string): void {
    this.chip.dataset.tone = tone;
    this.chip.textContent = text;
  }
}
