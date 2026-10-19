import type { OfflineMaps, RegionRow } from '../maps/offlineMaps';
import { formatBytes, formatMapVersion } from './format';

/** Small helper so the rendering code reads top-to-bottom like the layout. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string } = {},
  ...children: (Node | null)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text) node.textContent = props.text;
  for (const child of children) if (child) node.append(child);
  return node;
}

function button(label: string, onClick: () => void, variant: 'primary' | 'secondary' = 'primary') {
  const b = el('button', { className: `btn btn-${variant}`, text: label });
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

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
  ) {
    this.list = dialog.querySelector('.region-list')!;
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
    const rows = this.maps.rows();

    this.notice.hidden = this.maps.catalogAvailable;
    this.notice.textContent = navigator.onLine
      ? "Couldn't load the list of maps. Please try again in a moment."
      : 'Connect to the internet to see maps you can download.';

    this.list.replaceChildren(...rows.map((row) => this.renderRow(row)));
    void this.renderStorage();
  }

  private renderRow(row: RegionRow): HTMLElement {
    const name = row.state === 'downloaded' ? row.stored.name : row.info.name;
    const id = row.state === 'downloaded' ? row.stored.id : row.info.id;
    const description = row.state === 'downloaded' ? null : row.info.description;

    const item = el(
      'li',
      { className: `region region-${row.state}` },
      el('div', { className: 'region-name', text: name }),
      description ? el('div', { className: 'region-desc', text: description }) : null,
    );

    switch (row.state) {
      case 'available': {
        const resuming = row.partialBytes > 0;
        const pct = Math.floor((row.partialBytes / row.info.bytes) * 100);
        item.append(
          el(
            'div',
            { className: 'region-meta' },
            document.createTextNode(
              resuming ? `Paused at ${pct}% · ${formatBytes(row.info.bytes)}` : formatBytes(row.info.bytes),
            ),
          ),
          el(
            'div',
            { className: 'region-actions' },
            button(resuming ? 'Resume' : 'Download', () => void this.maps.download(id)),
            resuming ? button('Delete', () => void this.maps.remove(id), 'secondary') : null,
          ),
        );
        break;
      }

      case 'downloading': {
        const pct = Math.floor((row.receivedBytes / row.info.bytes) * 100);
        const bar = el('progress', { className: 'region-progress' });
        bar.max = 100;
        bar.value = pct;
        item.append(
          bar,
          el('div', {
            className: 'region-meta',
            text: `${pct}% · ${formatBytes(row.receivedBytes)} of ${formatBytes(row.info.bytes)} · keep the app open`,
          }),
          el('div', { className: 'region-actions' }, button('Cancel', () => this.maps.cancel(id), 'secondary')),
        );
        break;
      }

      case 'downloaded': {
        item.append(
          el('div', {
            className: 'region-meta',
            text: `✓ Saved on this phone · ${formatBytes(row.stored.bytes)} · map data from ${formatMapVersion(row.stored.version)}`,
          }),
          el(
            'div',
            { className: 'region-actions' },
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
    if (error) item.append(el('p', { className: 'region-error', text: error }));
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
