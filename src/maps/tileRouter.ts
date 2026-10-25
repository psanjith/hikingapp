import * as maplibregl from 'maplibre-gl';
import { FetchSource, FileSource, PMTiles } from 'pmtiles';
import { boundsArea, boundsIntersect, tileBounds } from '../map/geo';
import type { Bounds } from './types';

export const TILE_PROTOCOL = 'hike';

interface Archive {
  id: string;
  bounds: Bounds;
  pmtiles: PMTiles;
}

/**
 * Serves map tiles to MapLibre from whichever source has them:
 *
 *   1. Regions downloaded to this phone (works with no signal), then
 *   2. the online map file on R2, streamed tile-by-tile, if there's internet.
 *
 * MapLibre asks for tiles at hike://tiles/{z}/{x}/{y}. Routing behind one URL
 * means the style has a single map source and one set of layers, however many
 * regions are downloaded, and overlapping regions (e.g. Lower Mainland inside
 * all of BC) don't draw twice.
 */
export class TileRouter {
  private local: Archive[] = [];
  private online: Archive[] = [];

  constructor() {
    maplibregl.addProtocol(TILE_PROTOCOL, async (params, abortController) => {
      const match = /\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
      if (!match) throw new Error(`Bad tile URL: ${params.url}`);
      const [z, x, y] = match.slice(1).map(Number);
      return { data: await this.getTile(z, x, y, abortController.signal) };
    });
  }

  /** Use these downloaded files, smallest region first (most specific wins). */
  setLocalRegions(regions: { id: string; bounds: Bounds; file: File }[]): void {
    this.local = regions
      .map((r) => ({ id: r.id, bounds: r.bounds, pmtiles: new PMTiles(new FileSource(r.file)) }))
      .sort((a, b) => boundsArea(a.bounds) - boundsArea(b.bounds));
  }

  /**
   * Regions to stream over the internet for areas not downloaded (one per
   * province). Each file is only opened, and its index fetched, the first
   * time a tile in its area is needed.
   */
  setOnlineSources(regions: { id: string; url: string; bounds: Bounds }[]): void {
    this.online = regions
      .map((r) => ({ id: r.id, bounds: r.bounds, pmtiles: new PMTiles(new FetchSource(r.url)) }))
      .sort((a, b) => boundsArea(a.bounds) - boundsArea(b.bounds));
  }

  get hasLocalRegions(): boolean {
    return this.local.length > 0;
  }

  /** Whether a downloaded region covers this point (used for "no offline map here" hints). */
  coversOffline(lon: number, lat: number): boolean {
    return this.local.some(
      ({ bounds: [w, s, e, n] }) => lon >= w && lon <= e && lat >= s && lat <= n,
    );
  }

  private async getTile(z: number, x: number, y: number, signal: AbortSignal): Promise<ArrayBuffer> {
    const tile = tileBounds(z, x, y);

    // Downloaded regions first: they work with no signal. A province file
    // has no tiles outside its border (the box around it is bigger than the
    // province), so an empty answer just moves on to the next source.
    for (const archive of this.local) {
      if (!boundsIntersect(tile, archive.bounds)) continue;
      try {
        const result = await archive.pmtiles.getZxy(z, x, y, signal);
        if (result) return result.data;
      } catch (error) {
        if (signal.aborted) throw error;
        // A damaged file shouldn't break the map; fall through to the next source.
        console.warn(`Tile ${z}/${x}/${y} unreadable in ${archive.id}`, error);
      }
    }

    // navigator.onLine can be wrong in the "connected to Wi-Fi without
    // internet" case, but then the fetch simply fails and we return empty.
    // Provinces are cut along their borders, so a tile near a border may only
    // exist in the neighbour's file: keep trying until one has it.
    if (navigator.onLine) {
      for (const archive of this.online) {
        if (!boundsIntersect(tile, archive.bounds)) continue;
        try {
          const result = await archive.pmtiles.getZxy(z, x, y, signal);
          if (result) return result.data;
        } catch (error) {
          if (signal.aborted) throw error;
        }
      }
    }

    // An empty tile is valid: MapLibre just draws nothing there (e.g. ocean,
    // or an area with no downloaded map while offline). It must be a fresh
    // buffer each time: MapLibre transfers ownership of it to its worker.
    return new ArrayBuffer(0);
  }
}
