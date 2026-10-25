import { saveFile } from '../device/files';
import type { HikeHistory } from '../history/hikeHistory';
import type { LonLat } from '../map/geo';
import type { Hike } from '../recording/types';
import { renderShareImage, type ShareImageOptions } from '../share/shareImage';
import { formatDistance, formatDuration } from './format';
import { showToast } from './toast';

/**
 * "Share your hike": makes a transparent image of the route (and stats) to lay
 * over a photo in an Instagram story or similar. Copy is the quickest route
 * into a story (paste it as a sticker); Save goes through the share sheet.
 */
export class SharePanel {
  private readonly preview: HTMLImageElement;
  private readonly copyButton: HTMLButtonElement;
  private hike: Hike | null = null;
  private track: LonLat[][] = [];
  private image: Blob | null = null;
  private previewUrl: string | null = null;
  private options: ShareImageOptions = { color: 'white', showStats: true };

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly history: HikeHistory,
  ) {
    this.preview = dialog.querySelector('.share-preview img')!;
    this.copyButton = dialog.querySelector('.share-copy')!;
    // Copying images needs the async Clipboard API; older browsers just get Save.
    this.copyButton.hidden = !('ClipboardItem' in window && navigator.clipboard?.write);

    for (const input of dialog.querySelectorAll<HTMLInputElement>('input[name="share-color"]')) {
      input.addEventListener('change', () => {
        this.options.color = input.value as ShareImageOptions['color'];
        void this.render();
      });
    }
    dialog.querySelector<HTMLInputElement>('.share-stats')!.addEventListener('change', (event) => {
      this.options.showStats = (event.target as HTMLInputElement).checked;
      void this.render();
    });
    this.copyButton.addEventListener('click', () => void this.copy());
    dialog.querySelector('.share-save')!.addEventListener('click', () => void this.save());
    dialog.querySelector('.panel-close')!.addEventListener('click', () => this.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close();
    });
  }

  async open(hike: Hike): Promise<void> {
    this.hike = hike;
    this.track = await this.history.track(hike.id);
    await this.render();
    this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  private async render(): Promise<void> {
    if (!this.hike) return;
    this.dialog.dataset.color = this.options.color; // Lets the preview background contrast with the ink.
    this.image = await renderShareImage(
      this.track,
      {
        distance: formatDistance(this.hike.distanceMeters),
        time: formatDuration(this.hike.activeMs),
        climb: typeof this.hike.climbMeters === 'number' ? `${Math.round(this.hike.climbMeters)} m` : undefined,
      },
      this.options,
    );
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = URL.createObjectURL(this.image);
    this.preview.src = this.previewUrl;
  }

  private async copy(): Promise<void> {
    if (!this.image) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.image })]);
      showToast('Copied. Open your Instagram story and paste it in as a sticker.', { durationMs: 6_000 });
    } catch {
      showToast("Couldn't copy the image. Use Save image instead.", { durationMs: 5_000 });
    }
  }

  private async save(): Promise<void> {
    if (!this.image || !this.hike) return;
    const name = `${this.hike.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hike'}.png`;
    const file = new File([this.image], name, { type: 'image/png' });
    const save = async () => {
      if ((await saveFile(file)) === 'needs-tap') {
        showToast('Your image is ready.', { actionLabel: 'Save', onAction: () => void save() });
      }
    };
    await save();
  }
}
