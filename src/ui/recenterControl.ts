import type * as maplibregl from 'maplibre-gl';

const LOCATE_ICON = `
<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
  <circle cx="12" cy="12" r="4" fill="currentColor"/>
  <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/**
 * Large "centre on me" button, placed bottom-right within thumb reach.
 * Implemented as a MapLibre control so it sits in the map's control layout.
 */
export class RecenterControl implements maplibregl.IControl {
  private readonly container = document.createElement('div');
  private readonly button = document.createElement('button');

  constructor(onClick: () => void) {
    this.container.className = 'recenter-ctrl';
    this.button.type = 'button';
    this.button.className = 'recenter-btn';
    this.button.setAttribute('aria-label', 'Centre map on my location');
    this.button.innerHTML = LOCATE_ICON;
    this.button.addEventListener('click', onClick);
    this.container.append(this.button);
  }

  /** Filled when the map is following the user, outlined when it isn't. */
  setActive(active: boolean): void {
    this.button.classList.toggle('is-active', active);
    this.button.setAttribute('aria-pressed', String(active));
  }

  onAdd(): HTMLElement {
    return this.container;
  }

  onRemove(): void {
    this.container.remove();
  }
}
