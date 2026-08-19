/**
 * Geometry pipeline (§11): world-atlas 50m (Natural Earth, public domain)
 *   → assign ISO3 ids (M49 numeric → alpha3; overrides for id=-99)
 *   → mapshaper simplify (visvalingam weighted 20%, keep-shapes, drop islands <5 km²)
 *   → TopoJSON (quantization 1e4) + per-feature centroid/bbox index.
 *
 * Usage: node scripts/etl/geo/build-geo.ts [--out <dir>]   (default: public/data/v1/geo)
 * Also importable: buildGeo() returns { topo, index } without writing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  Polygon,
  MultiPolygon,
  Position,
} from 'geojson';
import { GEO, PATHS } from '../config.ts';
import { writeJsonAtomic, writeFileAtomic, sha256 } from '../lib/atomic.ts';
import { log } from '../lib/log.ts';

const require = createRequire(import.meta.url);
// i18n-iso-countries and mapshaper are CommonJS
const isoCountries = require('i18n-iso-countries') as {
  numericToAlpha3: (n: string | number) => string | undefined;
};
const mapshaper = require('mapshaper') as {
  applyCommands: (
    cmd: string,
    input: Record<string, string>,
  ) => Promise<Record<string, Buffer | string>>;
};

interface GeoOverrides {
  by_name: Record<string, string | null>;
  by_iso3: Record<string, string | null>;
}

export interface GeoIndexEntry {
  name: string; // Natural Earth name
  centroid: [number, number];
  bbox: [number, number, number, number];
  fill: boolean; // false for "_" prefixed boundary-only features
}
export interface GeoIndex {
  schema: 1;
  source: 'world-atlas@2.0.2 / Natural Earth 1:50m';
  features: Record<string, GeoIndexEntry>;
}

function ringArea(ring: Position[]): number {
  // planar shoelace on lon/lat (adequate for choosing the largest ring + centroid)
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % n]!;
    a += x1! * y2! - x2! * y1!;
  }
  return a / 2;
}
function ringCentroid(ring: Position[]): [number, number] {
  let cx = 0,
    cy = 0,
    a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % n]!;
    const f = x1! * y2! - x2! * y1!;
    cx += (x1! + x2!) * f;
    cy += (y1! + y2!) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-12) {
    // degenerate: average points
    const xs = ring.map((p) => p[0]!);
    const ys = ring.map((p) => p[1]!);
    return [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length];
  }
  a *= 3;
  return [cx / a, cy / a];
}

function polygons(g: Geometry): Position[][][] {
  if (g.type === 'Polygon') return [(g as Polygon).coordinates];
  if (g.type === 'MultiPolygon') return (g as MultiPolygon).coordinates;
  return [];
}

/** Centroid of the largest polygon; bbox of all, with antimeridian handling. */
function centroidAndBbox(g: Geometry): {
  centroid: [number, number];
  bbox: [number, number, number, number];
} {
  const polys = polygons(g);
  let best: Position[] | null = null;
  let bestArea = -1;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const lons: number[] = [];
  for (const poly of polys) {
    const outer = poly[0]!;
    const a = Math.abs(ringArea(outer));
    if (a > bestArea) {
      bestArea = a;
      best = outer;
    }
    for (const [x, y] of outer) {
      lons.push(x!);
      if (x! < minX) minX = x!;
      if (x! > maxX) maxX = x!;
      if (y! < minY) minY = y!;
      if (y! > maxY) maxY = y!;
    }
  }
  let bbox: [number, number, number, number] = [minX, minY, maxX, maxY];
  // Antimeridian: if the bbox spans > 180°, recompute with negative longitudes shifted by +360
  if (maxX - minX > 180) {
    let mn = Infinity,
      mx = -Infinity;
    for (const x of lons) {
      const xx = x < 0 ? x + 360 : x;
      if (xx < mn) mn = xx;
      if (xx > mx) mx = xx;
    }
    if (mx - mn < maxX - minX) bbox = [mn, minY, mx, maxY];
  }
  let c = best ? ringCentroid(best) : [(minX + maxX) / 2, (minY + maxY) / 2];
  if (best && bbox[2] > 180) {
    // largest ring crosses the antimeridian: compute centroid in shifted space, then normalise
    const shifted = best.map(([x, y]) => [x! < 0 ? x! + 360 : x!, y!] as Position);
    const sc = ringCentroid(shifted);
    c = [sc[0] > 180 ? sc[0] - 360 : sc[0], sc[1]];
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    centroid: [round(c[0]!), round(c[1]!)],
    bbox: [round(bbox[0]), round(bbox[1]), round(bbox[2]), round(bbox[3])],
  };
}

export async function buildGeo(): Promise<{ topo: Topology; index: GeoIndex; topoText: string }> {
  const overrides = JSON.parse(readFileSync(PATHS.geoOverrides, 'utf8')) as GeoOverrides;
  const atlas = JSON.parse(readFileSync(GEO.input, 'utf8')) as Topology;
  const fc = feature(
    atlas,
    atlas.objects.countries as GeometryCollection,
  ) as unknown as FeatureCollection;

  const out: Feature[] = [];
  const seen = new Map<string, number>();
  for (const f of fc.features) {
    const name = String((f.properties as { name?: string })?.name ?? '');
    let iso3: string | null | undefined;
    const idStr = f.id == null ? '' : String(f.id);
    if (name in overrides.by_name) iso3 = overrides.by_name[name];
    else if (idStr && idStr !== '-99')
      iso3 = isoCountries.numericToAlpha3(idStr.padStart(3, '0')) ?? undefined;
    if (iso3 === undefined) {
      log.warn(
        `geo: no ISO3 for feature id=${idStr} name="${name}" — dropped (add to geo/overrides.json)`,
      );
      continue;
    }
    if (iso3 === null) continue; // explicit drop
    if (iso3 in overrides.by_iso3 && overrides.by_iso3[iso3] === null) continue;
    if (seen.has(iso3)) {
      log.warn(`geo: duplicate ISO3 ${iso3} (${name}) — merging is not implemented, keeping first`);
      continue;
    }
    seen.set(iso3, 1);
    out.push({ type: 'Feature', id: iso3, properties: { iso3, name }, geometry: f.geometry });
  }
  log.info(`geo: ${out.length} features with ISO3 ids`);

  // Pass 1 (lat/long CRS needed for km² island filter): simplify + filter islands → GeoJSON
  const inputGeo = JSON.stringify({ type: 'FeatureCollection', features: out });
  const cmd1 = [
    '-i input.json',
    `-simplify ${GEO.simplify}`,
    `-filter-islands ${GEO.filterIslands}`,
    // NOTE: no "-clean": world-atlas topology is already clean and -clean corrupts Fiji's rings.
    '-o pass1.json format=geojson id-field=iso3',
  ].join(' ');
  log.info(`geo: mapshaper ${cmd1}`);
  const r1 = await mapshaper.applyCommands(cmd1, { 'input.json': inputGeo });
  const pass1 = JSON.parse(String(r1['pass1.json'])) as FeatureCollection;
  // Natural Earth rings that touch both −180 and +180 (Russia, Fiji) render as a world-wide band in
  // MapLibre's GeoJSON pipeline. Unwrap them: shift the minority side by ±360 so the ring is contiguous.
  let unwrapped = 0;
  for (const f of pass1.features) {
    for (const poly of polygons(f.geometry)) {
      for (const ring of poly) {
        let mn = Infinity,
          mx = -Infinity,
          pos = 0;
        for (const [x] of ring) {
          if (x! < mn) mn = x!;
          if (x! > mx) mx = x!;
          if (x! > 0) pos++;
        }
        if (mx - mn > 180) {
          const shiftNeg = pos >= ring.length / 2;
          for (const p of ring) {
            if (shiftNeg && p[0]! < 0) p[0] = p[0]! + 360;
            else if (!shiftNeg && p[0]! > 0) p[0] = p[0]! - 360;
          }
          unwrapped++;
        }
      }
    }
  }
  if (unwrapped) log.info(`geo: unwrapped ${unwrapped} antimeridian-spanning rings`);

  // Pass 2: encode as TopoJSON (unit-less, so unwrapped longitudes > 180 are fine)
  const cmd2 = `-i pass1.json -o world.json format=topojson id-field=iso3 quantization=${GEO.quantization}`;
  const result = await mapshaper.applyCommands(cmd2, { 'pass1.json': JSON.stringify(pass1) });
  const topoBuf = result['world.json'];
  if (!topoBuf) throw new Error('mapshaper produced no output');
  const topo = JSON.parse(topoBuf.toString()) as Topology;
  // mapshaper names the object after the input layer ("input"); rename to "countries"
  const objName = Object.keys(topo.objects)[0]!;
  if (objName !== 'countries') {
    topo.objects['countries'] = topo.objects[objName]!;
    delete topo.objects[objName];
  }
  // Drop geometries that collapsed to null during simplification/quantization (tiny islands)
  const coll = topo.objects['countries'] as GeometryCollection;
  const before = coll.geometries.length;
  coll.geometries = coll.geometries.filter((gm) => {
    const ok =
      gm.type != null && gm.type !== undefined && (gm as { type: string | null }).type !== null;
    if (!ok)
      log.warn(
        `geo: feature ${String(gm.id ?? (gm.properties as { iso3?: string })?.iso3)} collapsed to null geometry — dropped`,
      );
    return ok;
  });
  if (coll.geometries.length !== before)
    log.info(`geo: dropped ${before - coll.geometries.length} null geometries`);
  // Build index from simplified geometry
  const simplified = feature(
    topo,
    topo.objects['countries'] as GeometryCollection,
  ) as unknown as FeatureCollection;
  const index: GeoIndex = {
    schema: 1,
    source: 'world-atlas@2.0.2 / Natural Earth 1:50m',
    features: {},
  };
  for (const f of simplified.features) {
    const iso3 = String(f.id ?? (f.properties as { iso3?: string })?.iso3 ?? '');
    if (!iso3) throw new Error('geo: feature lost its id after simplification');
    const { centroid, bbox } = centroidAndBbox(f.geometry);
    index.features[iso3] = {
      name: String((f.properties as { name?: string })?.name ?? iso3),
      centroid,
      bbox,
      fill: !iso3.startsWith('_'),
    };
  }
  // Ensure every geometry has its id set (topojson-client feature() reads geometry.id)
  for (const g of (topo.objects['countries'] as GeometryCollection).geometries) {
    if (g.id == null) g.id = (g.properties as { iso3?: string })?.iso3;
    if (g.id == null) throw new Error('geo: geometry without id');
  }
  const topoText = JSON.stringify(topo) + '\n';
  const bytes = Buffer.byteLength(topoText);
  log.info(`geo: topojson ${(bytes / 1024).toFixed(0)} KB, ${simplified.features.length} features`);
  if (bytes > GEO.maxTopoBytes) {
    throw new Error(`geo: topojson ${bytes} bytes exceeds gate ${GEO.maxTopoBytes}`);
  }
  if (
    simplified.features.length < GEO.minFeatures ||
    simplified.features.length > GEO.maxFeatures
  ) {
    throw new Error(
      `geo: feature count ${simplified.features.length} outside [${GEO.minFeatures}, ${GEO.maxFeatures}]`,
    );
  }
  return { topo, index, topoText };
}

export async function writeGeo(outDir: string) {
  const { index, topoText } = await buildGeo();
  writeFileAtomic(join(outDir, 'world-50m.topo.json'), topoText);
  writeJsonAtomic(join(outDir, 'geo-index.json'), index);
  const notes = readFileSync(PATHS.disputedNotes, 'utf8');
  writeFileAtomic(join(outDir, 'disputed-notes.json'), notes.endsWith('\n') ? notes : notes + '\n');
  log.ok(`geo: wrote ${outDir} (sha256 ${sha256(topoText).slice(0, 8)})`);
}

// CLI
const isMain = process.argv[1] && /build-geo\.ts$/.test(process.argv[1]);
if (isMain) {
  const i = process.argv.indexOf('--out');
  const outDir = i > 0 ? process.argv[i + 1]! : join(PATHS.publicData, 'geo');
  if (!existsSync(GEO.input)) {
    console.error(`missing ${GEO.input} — run npm install`);
    process.exit(1);
  }
  writeGeo(outDir).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
