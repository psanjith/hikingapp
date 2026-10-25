import type { OfflineMaps, RegionRow } from '../maps/offlineMaps';
import { button, el } from './dom';
import { formatBytes, formatMapVersion } from './format';

/**
 * The "Offline maps" sheet: lists regions with Download / Resume / Update /
 * Delete, shows live progress, and shows how much storage is used.
 */
export class MapsPanel {
  private readonly list: HTMLElement;
  private readonly storage: HTMLElement;
  private readonly notice: HTMLElement;

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly maps: OfflineMaps,
    /** Where the hiker is, if known, to list nearby regions first. */
    private readonly position: () => { lon: number; lat: number } | null = () => null,
  ) {
    this.list = dialog.querySelector('.card-list')!;
    this.storage = dialog.querySelector('.storage-summary')!;
    this.notice = dialog.querySelector('.panel-notice')!;

    dialog.querySelector('.panel-close')!.addEventListener('click', () => this.close());
    // Tapping the dimmed backdrop (outside the sheet) closes it too.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close();
    });

    maps.subscribe(() => {
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
    const fix = this.position();
    const rows = this.maps.rows(fix ? [fix.lon, fix.lat] : undefined);

    if (!this.maps.canSaveMaps) {
      this.notice.hidden = false;
      this.notice.textContent =
        "This browser can't save maps to your phone. If you're in a Private Browsing tab, open the app in a normal tab or from your Home Screen.";
    } else {
      this.notice.hidden = this.maps.catalogAvailable;
      this.notice.textContent = navigator.onLine
        ? "Couldn't load the list of maps. Please try again in a moment."
        : 'Connect to the internet to see maps you can download.';
    }

    this.list.replaceChildren(...rows.map((row) => this.renderRow(row)));
    void this.renderStorage();
  }

  private renderRow(row: RegionRow): HTMLElement {
    const name = row.state === 'downloaded' ? row.stored.name : row.info.name;
    const id = row.state === 'downloaded' ? row.stored.id : row.info.id;
    const description = row.state === 'downloaded' ? null : row.info.description;

    const item = el(
      'li',
      { className: `card region-${row.state}` },
      el(
        'div',
        { className: 'card-name' },
        document.createTextNode(name),
        row.nearby ? el('span', { className: 'near-tag', text: 'Near you' }) : null,
      ),
      description ? el('div', { className: 'card-desc', text: description }) : null,
    );

    switch (row.state) {
      case 'available': {
        const resuming = row.partialBytes > 0;
        const pct = Math.floor((row.partialBytes / row.info.bytes) * 100);
        item.append(
          el(
            'div',
            { className: 'card-meta' },
            document.createTextNode(
              resuming ? `Paused at ${pct}% · ${formatBytes(row.info.bytes)}` : formatBytes(row.info.bytes),
            ),
          ),
          el(
            'div',
            { className: 'card-actions' },
            button(resuming ? 'Resume' : 'Download', () => void this.maps.download(id)),
            resuming ? button('Delete', () => void this.maps.remove(id), 'secondary') : null,
          ),
        );
        break;
      }

      case 'downloading': {
        const pct = Math.floor((row.receivedBytes / row.info.bytes) * 100);
        const bar = el('progress', { className: 'card-progress' });
        bar.max = 100;
        bar.value = pct;
        item.append(
          bar,
          el('div', {
            className: 'card-meta',
            text: `${pct}% · ${formatBytes(row.receivedBytes)} of ${formatBytes(row.info.bytes)} · keep the app open`,
          }),
          el('div', { className: 'card-actions' }, button('Cancel', () => this.maps.cancel(id), 'secondary')),
        );
        break;
      }

      case 'downloaded': {
        item.append(
          el('div', {
            className: 'card-meta',
            text: `✓ Saved on this phone · ${formatBytes(row.stored.bytes)} · map data from ${formatMapVersion(row.stored.version)}`,
          }),
          el(
            'div',
            { className: 'card-actions' },
            row.update
              ? button(`Update (${formatBytes(row.update.bytes)})`, () => void this.maps.download(id))
              : null,
            button('Delete', () => this.confirmDelete(id, name), 'secondary'),
          ),
        );
        break;
      }
    }

    const error = row.state === 'downloading' ? undefined : row.error;
    if (error) item.append(el('p', { className: 'card-error', text: error }));
    return item;
  }

  private confirmDelete(id: string, name: string): void {
    if (confirm(`Delete the offline map for ${name}? You'll need internet to download it again.`)) {
      void this.maps.remove(id);
    }
  }

  private async renderStorage(): Promise<void> {
    const { usedBytes, freeBytes, persisted } = await this.maps.storageSummary();
    const parts = [`Using ${formatBytes(usedBytes)}`];
    if (freeBytes !== null) parts.push(`${formatBytes(freeBytes)} available`);
    this.storage.textContent = parts.join(' · ');
    if (!persisted && this.maps.hasDownloadedRegions) {
      this.storage.textContent +=
        '. Tip: add this app to your Home Screen so your phone keeps your maps.';
    }
  }
}
