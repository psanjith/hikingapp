import { MAPS_BASE_URL } from '../config';
import type { Catalog } from './types';

const CACHE_KEY = 'hikingapp:catalog';

/**
 * Fetches the list of downloadable regions from map storage (Cloudflare R2).
 *
 * The catalog lives next to the map files rather than inside the app, so the
 * monthly map rebuild can publish new data without redeploying the app. The
 * last good copy is kept locally, so the Maps screen still makes sense offline.
 */
export async function loadCatalog(): Promise<Catalog | null> {
  const catalogUrl = new URL('catalog.json', baseUrl());
  try {
    const response = await fetch(catalogUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = resolveUrls((await response.json()) as Catalog, catalogUrl);
    saveCached(catalog);
    return catalog;
  } catch {
    return loadCached();
  }
}

/** Region URLs in catalog.json are relative to the catalog itself. */
function resolveUrls(catalog: Catalog, catalogUrl: URL): Catalog {
  return {
    ...catalog,
    regions: catalog.regions.map((r) => ({ ...r, url: new URL(r.url, catalogUrl).href })),
  };
}

function baseUrl(): URL {
  const base = MAPS_BASE_URL.endsWith('/') ? MAPS_BASE_URL : `${MAPS_BASE_URL}/`;
  return new URL(base, location.href);
}

function saveCached(catalog: Catalog): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // Not critical: we'll just refetch next time.
  }
}

function loadCached(): Catalog | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Catalog) : null;
  } catch {
    return null;
  }
}
