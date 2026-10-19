import { Compass } from '../device/compass';
import type { LocationSource } from '../location/types';
import { compassPoint, formatCoordinates } from './format';
import { showToast } from './toast';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** If the compass hasn't said anything this long after opening, explain why. */
const NO_READINGS_MS = 2_000;

/**
 * A full compass screen: a dial that turns like a real one, the heading in
 * degrees and plain words, and the hiker's coordinates (what you'd read out
 * to 911 or Search and Rescue).
 *
 * It shows magnetic north, like a physical compass does.
 */
export class CompassPanel {
  private readonly rose: SVGGElement;
  private readonly degrees: HTMLElement;
  private readonly direction: HTMLElement;
  private readonly problem: HTMLElement;
  private readonly allowButton: HTMLButtonElement;
  private readonly coords: HTMLElement;
  private stopListening: (() => void) | null = null;
  private timers: number[] = [];
  private frame = 0;

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly compass: Compass,
    private readonly location: LocationSource,
  ) {
    this.rose = buildDial(dialog.querySelector('.compass-dial')!);
    this.degrees = dialog.querySelector('.compass-degrees')!;
    this.direction = dialog.querySelector('.compass-direction')!;
    this.problem = dialog.querySelector('.compass-problem')!;
    this.allowButton = dialog.querySelector('.compass-allow')!;
    this.coords = dialog.querySelector('.compass-coords')!;

    this.allowButton.addEventListener('click', () => void this.allow());
    dialog.querySelector('.coords-copy')!.addEventListener('click', () => void this.copyCoordinates());
    dialog.querySelector('.panel-close')!.addEventListener('click', () => this.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close();
    });
    dialog.addEventListener('close', () => this.stop());
  }

  open(): void {
    this.problem.hidden = true;
    this.allowButton.hidden = true;
    this.renderHeading(this.compass.heading);
    this.renderCoordinates();
    this.stopListening = this.compass.subscribe((heading) => {
      // Compasses report many times a second: draw once per screen frame at most.
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.renderHeading(heading));
    });
    this.timers.push(
      window.setInterval(() => this.renderCoordinates(), 1_000),
      window.setTimeout(() => this.explainIfSilent(), NO_READINGS_MS),
    );
    this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  private stop(): void {
    this.stopListening?.();
    this.stopListening = null;
    cancelAnimationFrame(this.frame);
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
  }

  private renderHeading(heading: number | null): void {
    if (heading === null) {
      this.degrees.textContent = '–';
      this.direction.textContent = 'Waiting for the compass…';
      return;
    }
    this.problem.hidden = true;
    this.allowButton.hidden = true;
    // The rose turns the opposite way to the phone, so N always points north.
    this.rose.setAttribute('transform', `rotate(${-heading} 150 150)`);
    this.degrees.textContent = `${Math.round(heading) % 360}°`;
    this.direction.textContent = compassPoint(heading);
  }

  private explainIfSilent(): void {
    if (this.compass.isWorking) return;
    this.problem.hidden = false;
    if (Compass.needsPermission) {
      this.problem.textContent = 'Your iPhone needs permission to use the compass.';
      this.allowButton.hidden = false;
    } else {
      this.problem.textContent =
        "No compass readings. This device may not have a compass, or the browser doesn't share it.";
    }
  }

  private async allow(): Promise<void> {
    if (!(await this.compass.requestPermission())) {
      this.problem.textContent =
        'Compass access was turned down. Close the app completely, reopen it, and tap Allow when asked.';
    }
  }

  private renderCoordinates(): void {
    const fix = this.location.lastFix;
    this.coords.textContent = fix
      ? `${formatCoordinates(fix.lat, fix.lon)} (±${Math.round(fix.accuracy)} m)`
      : 'Waiting for GPS…';
  }

  private async copyCoordinates(): Promise<void> {
    const fix = this.location.lastFix;
    if (!fix) return;
    try {
      await navigator.clipboard.writeText(formatCoordinates(fix.lat, fix.lon));
      showToast('Coordinates copied. Paste them into a text or call notes.', { durationMs: 4_000 });
    } catch {
      showToast("Couldn't copy. Read the coordinates from the screen instead.", { durationMs: 4_000 });
    }
  }
}

/** Draws the compass rose (ticks, N/E/S/W) and a fixed pointer at the top. Returns the turning part. */
function buildDial(svg: SVGSVGElement): SVGGElement {
  const make = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };

  svg.setAttribute('viewBox', '0 0 300 300');
  const rose = make('g', {});
  rose.append(make('circle', { cx: 150, cy: 150, r: 138, class: 'dial-face' }));
  for (let deg = 0; deg < 360; deg += 10) {
    const major = deg % 30 === 0;
    const tick = make('line', {
      x1: 150,
      y1: 16,
      x2: 150,
      y2: major ? 34 : 26,
      class: major ? 'dial-tick major' : 'dial-tick',
      transform: `rotate(${deg} 150 150)`,
    });
    rose.append(tick);
  }
  for (const [label, deg] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]] as const) {
    const text = make('text', {
      x: 150,
      y: 62,
      class: label === 'N' ? 'dial-letter north' : 'dial-letter',
      transform: `rotate(${deg} 150 150)`,
    });
    text.textContent = label;
    rose.append(text);
  }
  svg.append(rose);
  // The pointer doesn't turn: it marks the direction the top of the phone faces.
  svg.append(make('path', { d: 'M150 2 L162 22 L138 22 Z', class: 'dial-pointer' }));
  svg.append(make('circle', { cx: 150, cy: 150, r: 5, class: 'dial-centre' }));
  return rose;
}
