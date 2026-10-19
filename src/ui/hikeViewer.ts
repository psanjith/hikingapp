import { saveFile } from '../device/files';
import type { HikeHistory } from '../history/hikeHistory';
import { boundsOfPoints } from '../map/geo';
import type { TrackLayer } from '../map/trackLayer';
import type { Hike } from '../recording/types';
import { formatDistance, formatDuration } from './format';
import { formatHikeDate } from './historyPanel';
import { showToast } from './toast';

/**
 * Shows one past hike: its track on the map, and a card at the bottom with
 * its stats and Export GPX / Rename / Delete. The map stays fully usable.
 */
export class HikeViewer {
  private hike: Hike | null = null;
  private readonly title: HTMLElement;
  private readonly meta: HTMLElement;

  constructor(
    private readonly card: HTMLElement,
    private readonly history: HikeHistory,
    private readonly layer: TrackLayer,
    /** Move the map so the hike fills the screen. */
    private readonly focus: (bounds: [number, number, number, number]) => void,
  ) {
    this.title = card.querySelector('.view-name')!;
    this.meta = card.querySelector('.view-meta')!;
    card.querySelector('.view-close')!.addEventListener('click', () => this.close());
    card.querySelector('.view-export')!.addEventListener('click', () => void this.export());
    card.querySelector('.view-rename')!.addEventListener('click', () => void this.rename());
    card.querySelector('.view-delete')!.addEventListener('click', () => void this.delete());
  }

  async show(hike: Hike): Promise<void> {
    this.hike = hike;
    this.render();
    this.card.hidden = false;
    const track = await this.history.track(hike.id);
    this.layer.show(track);
    const bounds = boundsOfPoints(track.flat());
    if (bounds) this.focus(bounds);
  }

  close(): void {
    this.hike = null;
    this.card.hidden = true;
    this.layer.show([]);
  }

  private render(): void {
    if (!this.hike) return;
    this.title.textContent = this.hike.name;
    this.meta.textContent = `${formatHikeDate(this.hike.startedAt)} · ${formatDistance(this.hike.distanceMeters)} · ${formatDuration(this.hike.activeMs)}`;
  }

  private async export(): Promise<void> {
    if (!this.hike) return;
    const file = await this.history.gpxFile(this.hike.id);
    const save = async () => {
      if ((await saveFile(file)) === 'needs-tap') {
        showToast('Your GPX file is ready.', { actionLabel: 'Save', onAction: () => void save() });
      }
    };
    await save();
  }

  private async rename(): Promise<void> {
    if (!this.hike) return;
    const name = prompt('Name this hike', this.hike.name);
    if (name?.trim()) {
      await this.history.rename(this.hike.id, name);
      this.render();
    }
  }

  private async delete(): Promise<void> {
    if (!this.hike) return;
    if (!confirm(`Delete “${this.hike.name}”? This can't be undone, unless it's in a backup.`)) return;
    await this.history.remove(this.hike.id);
    this.close();
    showToast('Hike deleted.', { durationMs: 4_000 });
  }
}
