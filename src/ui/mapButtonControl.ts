import type * as maplibregl from 'maplibre-gl';

export interface MapButtonOptions {
  label: string;
  /** Inline SVG markup. */
  icon: string;
  /** Short text shown under the icon, if any. */
  caption?: string;
  className?: string;
  onClick: () => void;
}

/**
 * A large round button that lives in MapLibre's control stack, so several of
 * them (and MapLibre's own attribution) stack neatly without overlapping.
 * Placed bottom-right, within thumb reach.
 */
export class MapButtonControl implements maplibregl.IControl {
  private readonly container = document.createElement('div');
  readonly button = document.createElement('button');

  constructor({ label, icon, caption, className, onClick }: MapButtonOptions) {
    this.container.className = 'map-btn-ctrl';
    this.button.type = 'button';
    this.button.className = `map-btn ${className ?? ''}`.trim();
    this.button.setAttribute('aria-label', label);
    this.button.innerHTML = icon;
    if (caption) {
      const text = document.createElement('span');
      text.textContent = caption;
      this.button.append(text);
    }
    this.button.addEventListener('click', onClick);
    this.container.append(this.button);
  }

  /** Visual on/off state, e.g. filled while the map is following the user. */
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

export const LOCATE_ICON = `
<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
  <circle cx="12" cy="12" r="4" fill="currentColor"/>
  <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export const MAPS_ICON = `
<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
  <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 2.1 6 2v11.8l-6-2V6.1Z" fill="currentColor"/>
</svg>`;
