import { saveFile } from '../device/files';
import { BackupError } from '../history/backup';
import type { HikeHistory } from '../history/hikeHistory';
import type { Hike } from '../recording/types';
import { button, el } from './dom';
import { formatClimb, formatDistance, formatDuration } from './format';
import { showToast } from './toast';
import { trackThumbnail } from './trackThumbnail';

export const formatHikeDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/**
 * "My hikes": totals, backup status, and the list of saved hikes.
 *
 * Hikes only live on this phone, so backing up is front and centre: the sheet
 * says how many hikes aren't backed up yet and offers one-tap backup/restore.
 */
export class HistoryPanel {
  private readonly totals: HTMLElement;
  private readonly backup: HTMLElement;
  private readonly list: HTMLElement;
  private readonly restoreInput: HTMLInputElement;

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly history: HikeHistory,
    private readonly onView: (hike: Hike) => void,
  ) {
    this.totals = dialog.querySelector('.history-totals')!;
    this.backup = dialog.querySelector('.backup-card')!;
    this.list = dialog.querySelector('.card-list')!;
    this.restoreInput = dialog.querySelector('.restore-file')!;

    this.restoreInput.addEventListener('change', () => {
      const file = this.restoreInput.files?.[0];
      this.restoreInput.value = '';
      if (file) void this.restore(file);
    });
    dialog.querySelector('.panel-close')!.addEventListener('click', () => this.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close();
    });
    history.subscribe(() => {
      if (dialog.open) this.render();
    });
  }

  open(): void {
    this.render();
    this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  private render(): void {
    const { count, distanceMeters, activeMs } = this.history.totals;
    this.totals.textContent =
      count === 0
        ? 'No hikes yet. Tap “Start hike” on the map to record your first one.'
        : `${count} ${count === 1 ? 'hike' : 'hikes'} · ${formatDistance(distanceMeters)} · ${formatDuration(activeMs)} hiking`;

    this.renderBackup(count);
    this.list.replaceChildren(...this.history.all.map((hike) => this.renderRow(hike)));
  }

  private renderBackup(count: number): void {
    const pending = this.history.notBackedUp;
    const last = this.history.lastBackupAt;
    let message: string;
    if (count === 0) message = 'Got a backup from before? Restore it to bring your hikes back.';
    else if (pending === 0) message = `✓ All hikes backed up${last ? ` (${formatHikeDate(last)})` : ''}.`;
    else
      message = `${pending} ${pending === 1 ? 'hike is' : 'hikes are'} only on this phone. Back up to iCloud Drive or Files so you don't lose ${pending === 1 ? 'it' : 'them'} if the app's data is cleared.`;

    this.backup.className = `backup-card${count > 0 && pending > 0 ? ' needs-backup' : ''}`;
    this.backup.replaceChildren(
      el('p', { text: message }),
      el(
        'div',
        { className: 'card-actions' },
        count > 0 ? button('Back up all hikes', () => void this.backUp()) : null,
        this.restoreButton(count > 0 ? 'secondary' : 'primary'),
      ),
    );
  }

  /** A <label> for the hidden file input: opens the file picker reliably on iOS. */
  private restoreButton(variant: 'primary' | 'secondary'): HTMLElement {
    const label = el('label', { className: `btn btn-${variant}`, text: 'Restore' });
    label.htmlFor = this.restoreInput.id;
    return label;
  }

  private renderRow(hike: Hike): HTMLElement {
    const row = el(
      'li',
      { className: 'card hike-row' },
      trackThumbnail(hike.preview ?? []),
      el(
        'div',
        { className: 'hike-row-text' },
        el('div', { className: 'card-name', text: hike.name }),
        el('div', {
          className: 'card-meta',
          text: hikeSummary(hike),
        }),
      ),
    );
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    const view = () => {
      this.close();
      this.onView(hike);
    };
    row.addEventListener('click', view);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') view();
    });
    return row;
  }

  private async backUp(): Promise<void> {
    const file = await this.history.backupFile();
    const save = async () => {
      const result = await saveFile(file);
      if (result === 'saved') {
        this.history.markBackedUp();
        showToast('Backup ready. Keep it somewhere safe, like iCloud Drive.', { durationMs: 6_000 });
      } else if (result === 'needs-tap') {
        showToast('Your backup is ready.', { actionLabel: 'Save', onAction: () => void save() });
      }
    };
    await save();
  }

  private async restore(file: File): Promise<void> {
    try {
      const { added, alreadyHere, routesAdded } = await this.history.restore(file);
      const parts = [`Restored ${added} ${added === 1 ? 'hike' : 'hikes'}`];
      if (alreadyHere > 0) parts.push(`${alreadyHere} already on this phone`);
      if (routesAdded > 0) parts.push(`${routesAdded} ${routesAdded === 1 ? 'route' : 'routes'}`);
      showToast(`${parts.join(' · ')}.`, { durationMs: 6_000 });
    } catch (error) {
      showToast(error instanceof BackupError ? error.message : "Couldn't restore that file. Please try again.", {
        durationMs: 8_000,
      });
    }
  }
}

/** "Sun, Oct 18, 2026 · 3.2 km · 1:05:12 · ↑ 240 m" (climb left out when unknown). */
export function hikeSummary(hike: Hike): string {
  return [formatHikeDate(hike.startedAt), formatDistance(hike.distanceMeters), formatDuration(hike.activeMs), formatClimb(hike.climbMeters)]
    .filter(Boolean)
    .join(' · ');
}
