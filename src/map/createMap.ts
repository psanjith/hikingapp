import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MAP_DATA_MAXZOOM } from '../config';
import { buildMapStyle } from '../maps/style';

// MapLibre decodes map tiles in a background Web Worker. By default it looks
// for the worker file next to its own script, which breaks once Vite bundles
// everything, so we tell it where Vite actually put the file.
maplibregl.setWorkerUrl(workerUrl);

export interface MapView {
  center: [number, number];
  zoom: number;
}

/**
 * Creates the full-screen MapLibre map with beginner-friendly defaults.
 * Tiles come from the TileRouter (downloaded regions first, then online).
 */
export function createMap(container: HTMLElement, view: MapView): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: buildMapStyle(MAP_DATA_MAXZOOM, 0),
    center: view.center,
    zoom: view.zoom,
    attributionControl: { compact: true },
    // Keep north at the top. A rotating map is a common source of confusion
    // for beginners, and a fixed orientation makes paper-map habits carry over.
    dragRotate: false,
    pitchWithRotate: false,
  });

  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  return map;
}
