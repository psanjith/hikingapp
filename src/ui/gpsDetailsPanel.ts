import type { GpsDiagnostics } from '../location/gpsDiagnostics';
import type { Recorder } from '../recording/recorder';
import { el } from './dom';

/** "4 s ago", "3 min ago". */
function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  return seconds < 90 ? `${seconds} s ago` : `${Math.round(seconds / 60)} min ago`;
}

/**
 * "GPS details": opened by tapping the GPS chip. Plain facts about what the
 * GPS and recorder have been doing, refreshed every second while open, so a
 * hiker can screenshot it when something seems wrong.
 */
export class GpsDetailsPanel {
  private readonly list: HTMLElement;
  private ticker: number | undefined;

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly diagnostics: GpsDiagnostics,
    private readonly recorder: Recorder,
  ) {
    this.list = dialog.querySelector('.details-list')!;
    dialog.querySelector('.panel-close')!.addEventListener('click', () => this.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close();
    });
    dialog.addEventListener('close', () => window.clearInterval(this.ticker));
  }

  open(): void {
    this.render();
    this.ticker = window.setInterval(() => this.render(), 1000);
    this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  private render(): void {
    const d = this.diagnostics;
    const now = Date.now();
    const rows: [string, string][] = [
      ['GPS readings received', String(d.fixCount)],
      ['Last reading', d.lastFix ? `${ago(d.lastFix.at, now)} · ±${Math.round(d.lastFix.accuracy)} m` : 'None yet'],
      ['GPS restarts by the app', String(d.rechecks)],
      [
        'Location errors',
        d.lastError
          ? `${[...d.errors].map(([kind, n]) => `${kind} × ${n}`).join(', ')} (last ${ago(d.lastError.at, now)})`
          : 'None',
      ],
      ['Times the app went to the background', String(d.backgrounded)],
    ];

    if (this.recorder.state !== 'idle') {
      const s = this.recorder.filterStats;
      rows.push(
        ['Hike points kept', String(s.kept)],
        [
          'Readings skipped',
          `${s['too-close']} not moved far enough, ${s.inaccurate} too inaccurate, ${s['out-of-order']} out of order`,
        ],
      );
    }

    this.list.replaceChildren(
      ...rows.flatMap(([term, value]) => [el('dt', { text: term }), el('dd', { text: value })]),
    );
  }
}
