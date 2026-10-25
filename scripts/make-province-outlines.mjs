#!/usr/bin/env node
/**
 * Makes the outline of each Canadian province and territory that the map
 * build cuts regions with (maps/provinces/<id>.geojson).
 *
 * Source: Natural Earth "Admin 1 – States, Provinces" (1:10m, public domain),
 * https://www.naturalearthdata.com. Download ne_10m_admin_1_states_provinces.geojson
 * and pass its path:
 *
 *   node scripts/make-province-outlines.mjs path/to/ne_10m_admin_1_states_provinces.geojson
 *
 * Each outline is simplified (the map build doesn't need coastline detail)
 * and grown by a few kilometres, so trails right on a border or coast are
 * never cut off. Neighbouring regions overlap slightly as a result; the app
 * handles that.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import buffer from '@turf/buffer';
import simplify from '@turf/simplify';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'maps/provinces');
const BUFFER_KM = 5;

/** Natural Earth's postal code → our region id. */
const IDS = {
  BC: 'british-columbia',
  AB: 'alberta',
  SK: 'saskatchewan',
  MB: 'manitoba',
  ON: 'ontario',
  QC: 'quebec',
  NB: 'new-brunswick',
  NS: 'nova-scotia',
  PE: 'prince-edward-island',
  NL: 'newfoundland-and-labrador',
  YT: 'yukon',
  NT: 'northwest-territories',
  NU: 'nunavut',
};

const source = process.argv[2];
if (!source) throw new Error('Pass the path to ne_10m_admin_1_states_provinces.geojson');
const world = JSON.parse(readFileSync(source, 'utf8'));
// Only the provinces maps/regions.json offers (e.g. Nunavut is left out: 2.5 GB, very few trails).
const wanted = new Set(
  JSON.parse(readFileSync(join(ROOT, 'maps/regions.json'), 'utf8')).regions.map((r) => r.id),
);
const provinces = world.features.filter((f) => f.properties.adm0_a3 === 'CAN' && wanted.has(IDS[f.properties.postal]));

mkdirSync(OUT_DIR, { recursive: true });
for (const province of provinces) {
  const id = IDS[province.properties.postal];
  if (!id) throw new Error(`Unexpected province: ${province.properties.name}`);
  // Simplify first (fast), grow, then simplify the grown shape again.
  let outline = simplify(province, { tolerance: 0.02, highQuality: false });
  outline = buffer(outline, BUFFER_KM, { units: 'kilometers' });
  outline = simplify(outline, { tolerance: 0.01, highQuality: false });
  const feature = {
    type: 'Feature',
    properties: { name: province.properties.name, source: 'Natural Earth 1:10m, buffered 5 km' },
    geometry: { type: outline.geometry.type, coordinates: round(outline.geometry.coordinates) },
  };
  writeFileSync(join(OUT_DIR, `${id}.geojson`), JSON.stringify(feature));
  console.log(`${id}: ${JSON.stringify(feature).length} bytes`);
}

/** 4 decimal places (~10 m) is plenty for cutting map regions and keeps files small. */
function round(coords) {
  return Array.isArray(coords[0]) ? coords.map(round) : coords.map((n) => Math.round(n * 1e4) / 1e4);
}
