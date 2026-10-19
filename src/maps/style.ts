import { layers, namedFlavor } from '@protomaps/basemaps';
import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { TILE_PROTOCOL } from './tileRouter';

const SOURCE = 'protomaps';

/** Hiking-map colours: trails in a strong red-brown, like printed trail maps. */
const TRAIL_COLOR = '#b23a1e';
const TRACK_COLOR = '#7a5230';

/**
 * Builds the MapLibre style: Protomaps' "light" basemap, plus our own trail
 * layers so footpaths stand out instead of being faint grey lines.
 *
 * Fonts and icons are served from the app itself (public/basemap), so they're
 * cached by the service worker and labels still render offline.
 */
export function buildMapStyle(maxzoom: number, tileVersion: number): StyleSpecification {
  const assets = new URL(`${import.meta.env.BASE_URL}basemap/`, location.href).href;
  const flavor = namedFlavor('light');

  const all = layers(SOURCE, flavor, { lang: 'en' });
  const labelIds = new Set(layers(SOURCE, flavor, { lang: 'en', labelsOnly: true }).map((l) => l.id));
  const base = all.filter((l) => !labelIds.has(l.id));
  const labels = all.filter((l) => labelIds.has(l.id));

  return {
    version: 8,
    glyphs: `${assets}fonts/{fontstack}/{range}.pbf`,
    sprite: `${assets}sprites/light`,
    sources: {
      [SOURCE]: {
        type: 'vector',
        // The version query changes when downloaded regions change, which
        // makes MapLibre drop its cached (possibly empty) tiles and re-ask.
        tiles: [tileUrl(tileVersion)],
        maxzoom,
        attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>',
      },
    },
    // Order matters: base map, then trails on top of it, then all labels.
    layers: [...base, ...trailLayers(), ...labels, trailNameLayer()],
  };
}

export function tileUrl(tileVersion: number): string {
  return `${TILE_PROTOCOL}://tiles/{z}/{x}/{y}?v=${tileVersion}`;
}

/** Footpaths, hiking trails and steps (not city sidewalks or crossings). */
const isTrail: FilterSpecification = [
  'all',
  ['==', ['get', 'kind'], 'path'],
  ['in', ['get', 'kind_detail'], ['literal', ['path', 'footway', 'steps', 'bridleway']]],
];

/** Gravel / forest service roads: important landmarks when hiking. */
const isTrack: FilterSpecification = [
  'all',
  ['==', ['get', 'kind'], 'path'],
  ['==', ['get', 'kind_detail'], 'track'],
];

function trailLayers(): LayerSpecification[] {
  const width: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 12, 1, 14, 2, 17, 4];
  return [
    {
      id: 'hike-tracks',
      type: 'line',
      source: SOURCE,
      'source-layer': 'roads',
      minzoom: 11,
      filter: isTrack,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': TRACK_COLOR, 'line-width': width, 'line-dasharray': [3, 1.5] },
    },
    {
      // White halo underneath, so trails stay visible over dark forest areas.
      id: 'hike-trails-casing',
      type: 'line',
      source: SOURCE,
      'source-layer': 'roads',
      minzoom: 12,
      filter: isTrail,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.8,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 14, 4, 17, 7],
      },
    },
    {
      id: 'hike-trails',
      type: 'line',
      source: SOURCE,
      'source-layer': 'roads',
      minzoom: 12,
      filter: isTrail,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': TRAIL_COLOR, 'line-width': width, 'line-dasharray': [2, 1] },
    },
  ];
}

function trailNameLayer(): LayerSpecification {
  return {
    id: 'hike-trail-names',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'roads',
    minzoom: 13,
    filter: ['all', ['==', ['get', 'kind'], 'path'], ['has', 'name']],
    layout: {
      'symbol-placement': 'line',
      'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
      'text-font': ['Noto Sans Medium'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 17, 14],
      'symbol-spacing': 300,
    },
    paint: {
      'text-color': TRAIL_COLOR,
      'text-halo-color': '#ffffff',
      'text-halo-width': 2,
    },
  };
}
