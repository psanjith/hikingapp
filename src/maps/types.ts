/** [west, south, east, north] in degrees. */
export type Bounds = [number, number, number, number];

/** A region offered for download, as listed in catalog.json on R2. */
export interface RegionInfo {
  id: string;
  name: string;
  description: string;
  /** Map data date, e.g. "20261018". A newer version means an update is available. */
  version: string;
  /** Absolute URL of the .pmtiles file. */
  url: string;
  bytes: number;
  bounds: Bounds;
}

export interface Catalog {
  generatedAt: string;
  maxzoom: number;
  /** Region streamed over the network when online, for areas not downloaded. */
  onlineRegionId?: string;
  regions: RegionInfo[];
}

/**
 * A fully downloaded region on this device, as recorded in IndexedDB.
 *
 * A record is only written after every byte has arrived and been verified,
 * so the map can never read a half-finished file. An interrupted download is
 * just a file in OPFS with no record yet; its size is where to resume from.
 */
export interface StoredRegion {
  id: string;
  name: string;
  version: string;
  bounds: Bounds;
  bytes: number;
  /** File name inside the OPFS maps folder. */
  fileName: string;
  downloadedAt: number;
}
