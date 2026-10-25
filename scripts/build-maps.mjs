#!/usr/bin/env node
/**
 * Builds the downloadable offline map regions.
 *
 * For each region in maps/regions.json it cuts that area out of the latest
 * daily OpenStreetMap build published by Protomaps (one huge planet file),
 * using `pmtiles extract`. Only the byte ranges for the region are fetched, so
 * we never download the ~140 GB planet.
 *
 * Output (mirrors the layout on Cloudflare R2):
 *   <out>/regions/<id>/<version>.pmtiles
 *   <out>/catalog.json            the list of regions the app shows
 *
 * Usage:
 *   node scripts/build-maps.mjs --out dist-maps [--pmtiles ./pmtiles]
 *       [--only lower-mainland,...] [--merge existing-catalog.json] [--build 20261024]
 *
 * --merge keeps entries from the currently published catalog for regions not
 * rebuilt this run, so rebuilding one region doesn't hide the others.
 * --build pins the Protomaps build (default: the latest), so regions built
 * one at a time in a single run all come from the same day's data.
 *
 * File names include the build date, so files are never overwritten in place.
 * A phone halfway through downloading last month's file can still finish.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILDS_INDEX = 'https://build-metadata.protomaps.dev/builds.json';
const BUILDS_BASE = 'https://build.protomaps.com/';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: 'dist-maps' },
    only: { type: 'string' },
    pmtiles: { type: 'string', default: 'pmtiles' },
    merge: { type: 'string' },
    build: { type: 'string' },
  },
});

const config = JSON.parse(readFileSync(join(ROOT, 'maps/regions.json'), 'utf8'));
const only = args.only?.split(',');
const regions = config.regions.filter((r) => !only || only.includes(r.id));
const outDir = resolve(args.out);

const version = args.build ?? (await latestBuild()); // e.g. "20261018"
const latest = `${version}.pmtiles`;
console.log(`Using Protomaps build ${version}`);

const catalog = {
  generatedAt: new Date().toISOString(),
  source: `Protomaps basemap ${version}, © OpenStreetMap contributors`,
  maxzoom: config.maxzoom,
  regions: [],
};

for (const region of regions) {
  const relPath = `regions/${region.id}/${version}.pmtiles`;
  const outFile = join(outDir, relPath);
  mkdirSync(dirname(outFile), { recursive: true });

  const area = region.bbox
    ? [`--bbox=${region.bbox.join(',')}`]
    : [`--region=${join(ROOT, 'maps', region.regionFile)}`];

  console.log(`Extracting ${region.id}…`);
  execFileSync(
    args.pmtiles,
    ['extract', BUILDS_BASE + latest, outFile, ...area, `--maxzoom=${config.maxzoom}`],
    { stdio: 'inherit' },
  );

  catalog.regions.push({
    id: region.id,
    name: region.name,
    description: region.description,
    version,
    url: relPath,
    bytes: statSync(outFile).size,
    bounds: region.bbox ?? boundsOfGeoJson(join(ROOT, 'maps', region.regionFile)),
    // Whole provinces are also streamed by the app when online, so the map
    // works anywhere in Canada with signal, downloaded or not.
    ...(region.online ? { online: true } : {}),
  });
}

if (args.merge) {
  const previous = readJsonOrNull(args.merge)?.regions ?? [];
  const rebuilt = new Set(catalog.regions.map((r) => r.id));
  const kept = previous.filter((r) => !rebuilt.has(r.id));
  // Keep the order defined in regions.json, and drop regions removed from it.
  const order = config.regions.map((r) => r.id);
  catalog.regions = [...catalog.regions, ...kept]
    .filter((r) => order.includes(r.id))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
console.log(`Wrote ${catalog.regions.length} regions to ${outDir}`);

async function latestBuild() {
  const builds = await (await fetch(BUILDS_INDEX)).json();
  return builds.at(-1).key.replace('.pmtiles', '');
}

function readJsonOrNull(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** [west, south, east, north] of a GeoJSON Feature's Polygon or MultiPolygon. */
function boundsOfGeoJson(path) {
  const feature = JSON.parse(readFileSync(path, 'utf8'));
  const coords = feature.geometry.coordinates.flat(Infinity);
  const lons = coords.filter((_, i) => i % 2 === 0);
  const lats = coords.filter((_, i) => i % 2 === 1);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}
