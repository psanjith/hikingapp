import { GpxError } from '../gpx/parseGpx';
import type { OfflineMaps } from '../maps/offlineMaps';
import type { Routes } from '../routes/routes';
import type { SavedRoute } from '../routes/types';
import { button, el } from './dom';
import { formatDistance } from './format';
import { showToast } from './toast';

interface RoutesPanelActions {
  /** Move the map so the whole route is visible. */
  focus(route: SavedRoute): void;
  openMaps(): void;
}

/**
 * The "Trail routes" sheet: import a GPX file, then show, hide or delete
 * saved routes. Each route warns if no downloaded map covers it, because a
 * route drawn on a blank map is far less useful once the signal is gone.
 */
export class RoutesPanel {
  private readonly list: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly importLabel: HTMLElement;

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly routes: Routes,
    private readonly maps: OfflineMaps,
    private readonly actions: RoutesPanelActions,
  ) {
    this.list = dialog.querySelector('.card-list')!;
    this.notice = dialog.querySelector('.panel-notice')!;
    this.importLabel = dialog.querySelector('.route-import')!;

    const input = dialog.querySelector<HTMLInputElement>('.route-file')!;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      // Clear it so choosing the same file again still fires 'change'.
      input.value = '';
      if (file) void this.importFile(file);
    });

    dialog.querySelector('.panel-close')!.addEventListener('click', () => this.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close();
    });

    const rerender = () => {
      if (dialog.open) this.render();
    };
    routes.subscribe(rerender);
    // Downloading a map can change whether a route is covered.
    maps.subscribe(rerender);
  }

  open(): void {
    this.notice.hidden = true;
    this.render();
    this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  private async importFile(file: File): Promise<void> {
    this.notice.hidden = true;
    this.importLabel.classList.add('is-busy');
    try {
      const route = await this.routes.importFile(file);
      this.close();
      this.actions.focus(route);
      this.announce(route);
    } catch (error) {
      this.notice.textContent =
        error instanceof GpxError ? error.message : "Couldn't import that file. Please try again.";
      this.notice.hidden = false;
    } finally {
      this.importLabel.classList.remove('is-busy');
    }
  }

  /** After an import: confirm it worked, and flag a missing offline map straight away. */
  private announce(route: SavedRoute): void {
    const { covered, suggestion } = this.maps.coverageFor(route.bounds);
    const summary = `Showing “${route.name}” · ${formatDistance(route.lengthMeters)}`;
    if (covered || !suggestion) {
      showToast(summary, { durationMs: 5_000 });
    } else {
      showToast(`${summary}. Download the ${suggestion.name} map so it works with no signal.`, {
        actionLabel: 'Maps',
        onAction: () => this.actions.openMaps(),
        durationMs: 15_000,
      });
    }
  }

  private render(): void {
    const routes = this.routes.all;
    this.list.replaceChildren(
      ...(routes.length > 0
        ? routes.map((route) => this.renderRow(route))
        : [el('li', { className: 'card-empty', text: 'No routes yet.' })]),
    );
  }

  private renderRow(route: SavedRoute): HTMLElement {
    const isActive = this.routes.active?.id === route.id;
    const imported = new Date(route.importedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    const meta = [formatDistance(route.lengthMeters), `added ${imported}`];
    if (isActive) meta.push('on the map');

    const item = el(
      'li',
      { className: `card${isActive ? ' is-active' : ''}` },
      el('div', { className: 'card-name', text: route.name }),
      el('div', { className: 'card-meta', text: meta.join(' · ') }),
    );

    const warning = this.coverageWarning(route);
    if (warning) item.append(warning);

    item.append(
      el(
        'div',
        { className: 'card-actions' },
        isActive
          ? button('Zoom to route', () => this.focus(route))
          : button('Show on map', () => {
              this.routes.show(route.id);
              this.focus(route);
            }),
        isActive ? button('Hide', () => this.routes.hide(), 'secondary') : null,
        button('Delete', () => this.confirmDelete(route), 'secondary'),
      ),
    );
    return item;
  }

  private coverageWarning(route: SavedRoute): HTMLElement | null {
    const { covered, suggestion } = this.maps.coverageFor(route.bounds);
    if (covered) return null;
    if (!suggestion) {
      return el('p', {
        className: 'card-warning',
        text: "This trail is outside the areas this app has maps for. It will still show, with your location, but there won't be a map underneath.",
      });
    }
    return el(
      'div',
      { className: 'card-warning' },
      el('p', {
        text: `No offline map covers this trail yet. Download “${suggestion.name}” before you go, or the map will be blank with no signal.`,
      }),
      button('Get map', () => {
        this.close();
        this.actions.openMaps();
      }),
    );
  }

  private focus(route: SavedRoute): void {
    this.close();
    this.actions.focus(route);
  }

  private confirmDelete(route: SavedRoute): void {
    if (confirm(`Delete the route “${route.name}”? You can import the GPX file again later.`)) {
      void this.routes.remove(route.id);
    }
  }
}
