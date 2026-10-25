import type { BatteryStatus } from '../device/battery';
import type { Recorder } from '../recording/recorder';
import type { TurnaroundMessage } from '../safety/turnaroundText';
import { formatDuration } from './format';

/** Below this, the battery reading turns red. */
const LOW_BATTERY = 0.2;

interface HikeBarActions {
  start(): void;
  finish(): void;
}

/**
 * The bottom-of-screen hike controls: a big "Start hike" button when idle,
 * and while hiking, live distance / time / battery with Pause and Finish.
 *
 * It also publishes the space it takes up as the CSS variable --bottom-ui, so
 * the scale bar, map credits and toasts sit above it rather than underneath.
 */
export class HikeBar {
  private readonly startButton: HTMLButtonElement;
  private readonly bar: HTMLElement;
  private readonly distance: HTMLElement;
  private readonly time: HTMLElement;
  private readonly status: HTMLElement;
  private readonly daylight: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly batteryStat: HTMLElement;
  private readonly battery: HTMLElement;
  private readonly batteryLabel: HTMLElement;
  private ticker: number | undefined;

  constructor(
    dock: HTMLElement,
    private readonly recorder: Recorder,
    actions: HikeBarActions,
  ) {
    const find = <T extends HTMLElement>(selector: string) => dock.querySelector<T>(selector)!;
    this.startButton = find('.start-hike');
    this.bar = find('.hike-bar');
    this.distance = find('.hike-distance');
    this.time = find('.hike-time');
    this.status = find('.hike-status');
    this.daylight = find('.hike-daylight');
    this.pauseButton = find('.hike-pause');
    this.batteryStat = find('.hike-battery-stat');
    this.battery = find('.hike-battery');
    this.batteryLabel = find('.hike-battery-label');

    this.startButton.addEventListener('click', () => actions.start());
    find('.hike-finish').addEventListener('click', () => actions.finish());
    this.pauseButton.addEventListener('click', () => {
      if (recorder.state === 'recording') recorder.pause();
      else recorder.resume();
    });

    // The dock floats 12px above the screen edge (see .hike-dock in the CSS).
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--bottom-ui', `${dock.offsetHeight + 12}px`);
    }).observe(dock);

    recorder.subscribe(() => this.render());
    this.render();
  }

  setBattery({ level, charging }: BatteryStatus): void {
    this.batteryStat.hidden = false;
    this.battery.textContent = `${Math.round(level * 100)}%`;
    this.batteryLabel.textContent = charging ? 'charging' : 'battery';
    this.batteryStat.classList.toggle('is-low', level < LOW_BATTERY && !charging);
  }

  /** The daylight / turnaround line, or null to hide it. */
  setDaylight(message: TurnaroundMessage | null): void {
    this.daylight.hidden = message === null;
    if (!message) return;
    this.daylight.textContent = message.text;
    this.daylight.dataset.tone = message.tone;
  }

  private render(): void {
    const state = this.recorder.state;
    this.startButton.hidden = state !== 'idle';
    this.bar.hidden = state === 'idle';

    // Only tick the clock while it's actually counting.
    window.clearInterval(this.ticker);
    if (state === 'recording') this.ticker = window.setInterval(() => this.renderStats(), 1000);
    if (state === 'idle') return;

    this.renderStats();
    const recording = state === 'recording';
    this.bar.dataset.state = state;
    this.pauseButton.textContent = recording ? 'Pause' : 'Resume';
    this.pauseButton.className = `btn ${recording ? 'btn-secondary' : 'btn-primary'} hike-pause`;
    this.status.textContent = !recording
      ? 'Paused. The map and your location still work.'
      : this.recorder.waitingForGps
        ? 'Recording. Waiting for a good GPS signal…'
        : 'Recording. Keep this app open.';
  }

  private renderStats(): void {
    const hike = this.recorder.current;
    if (!hike) return;
    this.distance.textContent = (hike.distanceMeters / 1000).toFixed(2);
    this.time.textContent = formatDuration(this.recorder.elapsedMs());
  }
}
