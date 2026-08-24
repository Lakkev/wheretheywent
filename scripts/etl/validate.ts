/**
 * validate.ts — zod schemas + the 15 invariants (§13.2) + golden numbers + size gates.
 *
 *   node scripts/etl/validate.ts --in .etl-staging      (candidate; compares against public/data/v1)
 *   node scripts/etl/validate.ts --in public/data/v1    (self-check of the published tree, CI gate)
 *
 * Writes <in>/_validation.json with per-group pass/fail so promote.ts can promote per source group.
 * Exit code 1 when the core group fails (or any group fails when --strict).
 */
import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import { THRESHOLDS, GOLDEN, GOLDEN_TOLERANCE_OVERRIDE, GEO, PATHS, SOURCE_IDS } from './config.ts';
import { readJsonIfExists, listFiles, sha256File, writeJsonAtomic } from './lib/atomic.ts';
import { KNOWN_COLLISIONS, NON_GEO_ENTITIES } from './lib/codes.ts';
import { pack, unpack } from '../../src/lib/columnar.ts';
import {
  METRIC_IDS,
  type Manifest,
  type SourcesFile,
  type CountriesFile,
  type StockFile,
  type CountryFile,
  type MetricsFile,
  type PackedSeries,
} from '../../src/lib/types.ts';
import { log } from './lib/log.ts';

const argv = process.argv.slice(2);
const IN = argv[argv.indexOf('--in') + 1] ?? PATHS.staging;
const STRICT = argv.includes('--strict');
const PREV = PATHS.publicData;
const isSelfCheck = IN.replace(/\\/g, '/') === PREV;

// ---------- zod schemas ----------
const Packed = z.array(
  z.union([z.number().int(), z.null(), z.tuple([z.enum(['z', 'n']), z.number().int().positive()])]),
);
const StockSchema = z.object({
  schema: z.literal(1),
  snapshot: z.string(),
  years: z.array(z.number().int()).min(1),
  metrics: z.array(z.string()).length(METRIC_IDS.length),
  asylum: z.record(z.string(), z.object({ v: z.array(Packed) })),
  origin: z.record(z.string(), z.object({ v: z.array(Packed) })),
  population: z.record(z.string(), Packed),
  totals: z.object({ asylum: z.array(Packed), origin: z.array(Packed) }),
  unmappable: z.array(z.string()),
  sources: z.array(z.string()),
});
const CountryMetaSchema = z.object({
  iso3: z.string().regex(/^[A-Z0-9_]{3,4}$/),
  iso2: z.string().nullable(),
  name: z.string().min(1),
  display_name: z.string().min(1),
  unhcr_code: z.string().nullable(),
  region: z.string(),
  region_slug: z.string(),
  centroid: z.tuple([z.number(), z.number()]).nullable(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  in_unhcr: z.boolean(),
  in_geo: z.boolean(),
  in_wpp: z.boolean(),
});
const CountriesSchema = z.object({
  schema: z.literal(1),
  count: z.number().int(),
  regions: z.array(z.object({ slug: z.string(), name: z.string() })),
  countries: z.array(CountryMetaSchema),
});
const CountrySchema = z.object({
  schema: z.literal(1),
  iso3: z.string(),
  meta: CountryMetaSchema,
  years: z.array(z.number().int()),
  metrics: z.array(z.string()),
  asylum: z.object({ v: z.array(Packed) }),
  origin: z.object({ v: z.array(Packed) }),
  population: Packed,
  demographics: z.array(
    z.object({
      year: z.number(),
      f: z.array(z.number().nullable()),
      m: z.array(z.number().nullable()),
      total: z.number().nullable(),
    }),
  ),
  top_origins: z.record(
    z.string(),
    z.array(
      z.object({
        p: z.string(),
        refugees: z.number().nullable(),
        asylum_seekers: z.number().nullable(),
      }),
    ),
  ),
  top_hosts: z.record(
    z.string(),
    z.array(
      z.object({
        p: z.string(),
        refugees: z.number().nullable(),
        asylum_seekers: z.number().nullable(),
      }),
    ),
  ),
  footnotes: z.array(
    z.object({
      year: z.number().nullable(),
      population_type: z.string(),
      text: z.string(),
      view: z.enum(['asylum', 'origin']),
    }),
  ),
  sources: z.array(z.string()),
});
const SourceEntrySchema = z.object({
  publisher: z.string().min(1),
  title: z.string().min(1),
  license: z.object({ id: z.string().min(1), url: z.string().url() }),
  attribution: z.string().min(1),
  data_as_of: z.string(),
  retrieved_at: z.string(),
  status: z.enum(['ok', 'stale', 'unstable']),
  content_hash: z.string(),
  caveats: z.array(z.string()),
});
const ManifestSchema = z.object({
  schema: z.literal(1),
  snapshot_id: z.string().min(6),
  generated_at: z.string(),
  year_min: z.number(),
  year_max: z.number(),
  stock_files: z.array(z.string()),
  files: z.record(
    z.string(),
    z.object({ sha256: z.string().length(64), bytes: z.number().int().nonnegative() }),
  ),
});

// ---------- result collection ----------
type Group = 'countries' | 'geo' | 'core' | 'nowcast' | 'idu' | 'meta';
interface Check {
  id: string;
  group: Group;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
function check(id: string, group: Group, ok: boolean, detail?: string) {
  checks.push({ id, group, ok, detail });
  (ok ? log.ok : log.error)(`${id}${detail ? ` — ${detail}` : ''}`);
}
function guard(id: string, group: Group, fn: () => string | void) {
  try {
    const d = fn();
    check(id, group, true, d ?? undefined);
  } catch (e) {
    check(id, group, false, e instanceof Error ? e.message : String(e));
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function sumPacked(p: PackedSeries): number | null {
  let s: number | null = null;
  for (const v of unpack(p)) if (v !== null) s = (s ?? 0) + v;
  return s;
}

function main() {
  log.group(`validate ${IN}${isSelfCheck ? ' (self-check)' : ` vs ${PREV}`}`);
  const status = readJsonIfExists<{ groups: Record<Group, boolean>; core_ok: boolean }>(
    join(IN, '_status.json'),
  );
  const groupsProduced: Record<Group, boolean> = status?.groups
    ? { ...status.groups, meta: true }
    : {
        countries: existsSync(join(IN, 'countries.json')),
        geo: existsSync(join(IN, 'geo/world-50m.topo.json')),
        core: existsSync(join(IN, 'stock')),
        nowcast: existsSync(join(IN, 'live/nowcast.json')),
        idu: existsSync(join(IN, 'live/idu-latest.json')),
        meta: true,
      };

  const manifest = readJsonIfExists<Manifest>(join(IN, 'manifest.json'));
  const sources = readJsonIfExists<SourcesFile>(join(IN, 'sources.json'));
  const countries = readJsonIfExists<CountriesFile>(join(IN, 'countries.json'));
  const metrics = readJsonIfExists<MetricsFile>(join(IN, 'metrics.json'));
  const prevManifest = isSelfCheck ? null : readJsonIfExists<Manifest>(join(PREV, 'manifest.json'));
  const stockFiles = (manifest?.stock_files ?? [])
    .map((f) => readJsonIfExists<StockFile>(join(IN, f)))
    .filter((x): x is StockFile => !!x);
  const geoIndex = readJsonIfExists<{ features: Record<string, { fill: boolean }> }>(
    join(IN, 'geo/geo-index.json'),
  );

  // ---------- meta: schemas ----------
  guard('schema: manifest', 'meta', () => {
    assert(manifest, 'manifest.json missing');
    ManifestSchema.parse(manifest);
  });
  guard('schema: sources + #9 every source has license + attribution', 'meta', () => {
    assert(sources, 'sources.json missing');
    for (const [id, s] of Object.entries(sources)) {
      const r = SourceEntrySchema.safeParse(s);
      assert(
        r.success,
        `${id}: ${r.success ? '' : r.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`,
      );
    }
    return `${Object.keys(sources).length} sources`;
  });
  guard('#15 every metric has definition + source_id', 'meta', () => {
    assert(metrics, 'metrics.json missing');
    for (const m of Object.values(metrics.metrics)) {
      assert(m.definition && m.definition.length > 20, `${m.id}: definition missing`);
      assert(
        m.source_id && sources && sources[m.source_id],
        `${m.id}: source_id ${m.source_id} not in sources.json`,
      );
    }
    for (const id of METRIC_IDS) assert(metrics.metrics[id], `metric ${id} missing`);
  });
  guard('#12 manifest sha256 matches files', 'meta', () => {
    assert(manifest, 'manifest missing');
    const onDisk = listFiles(IN).filter((f) => f !== 'manifest.json' && !f.startsWith('_'));
    const listed = Object.keys(manifest.files).sort();
    const missing = listed.filter((f) => !onDisk.includes(f));
    const extra = onDisk.filter((f) => !listed.includes(f));
    assert(!missing.length, `listed but missing on disk: ${missing.slice(0, 5).join(', ')}`);
    assert(!extra.length, `on disk but not in manifest: ${extra.slice(0, 5).join(', ')}`);
    let n = 0;
    for (const [f, meta] of Object.entries(manifest.files)) {
      // hashing 30 MB is fine
      assert(sha256File(join(IN, f)) === meta.sha256, `hash mismatch: ${f}`);
      n++;
    }
    return `${n} files verified`;
  });
  guard('#8 file size < 20 MiB, file count < 5000', 'meta', () => {
    const files = listFiles(IN);
    assert(files.length < THRESHOLDS.maxFiles, `${files.length} files`);
    for (const f of files) {
      const bytes = readFileSync(join(IN, f)).length;
      assert(bytes < THRESHOLDS.maxFileBytes, `${f} is ${bytes} bytes`);
    }
    return `${files.length} files`;
  });

  // ---------- countries ----------
  if (groupsProduced.countries) {
    guard('schema: countries', 'countries', () => {
      assert(countries, 'countries.json missing');
      CountriesSchema.parse(countries);
    });
    guard('#1 countries ≈ 232 (UNHCR entities)', 'countries', () => {
      assert(countries, 'missing');
      const n = countries.countries.filter((c) => c.in_unhcr).length;
      assert(
        Math.abs(n - THRESHOLDS.countriesExpected) <= THRESHOLDS.countriesTolerance,
        `${n} UNHCR entities`,
      );
      return `${n} UNHCR entities, ${countries.count} total`;
    });
    guard('#2 ★ collision golden cases (AUS→AUT / ARE→EGY / MAR→MTQ)', 'countries', () => {
      assert(countries, 'missing');
      const byIso = new Map(countries.countries.map((c) => [c.iso3, c]));
      for (const k of KNOWN_COLLISIONS) {
        const real = byIso.get(k.iso);
        assert(real, `${k.iso} (${k.name}) missing from countries.json`);
        assert(
          real.name.toLowerCase().includes(k.name.toLowerCase().split(' ')[0]!),
          `${k.iso} is named "${real.name}", expected ${k.name}`,
        );
        assert(
          real.unhcr_code === k.internal,
          `${k.iso} unhcr_code should be ${k.internal}, got ${real.unhcr_code}`,
        );
        const other = byIso.get(k.internal);
        assert(other, `${k.internal} (${k.collidesWith}) missing`);
        assert(
          !other.name.toLowerCase().includes(k.name.toLowerCase().split(' ')[0]!),
          `${k.internal} is named "${other.name}" — internal code leaked into ISO3 keying!`,
        );
      }
      return 'all three collisions keyed correctly';
    });
  }

  // ---------- geo ----------
  if (groupsProduced.geo) {
    guard('#14 geo feature count + ids + size gate', 'geo', () => {
      const p = join(IN, 'geo/world-50m.topo.json');
      assert(existsSync(p), 'topojson missing');
      const bytes = readFileSync(p).length;
      assert(bytes < GEO.maxTopoBytes, `topojson ${bytes} bytes > gate ${GEO.maxTopoBytes}`);
      const topo = JSON.parse(readFileSync(p, 'utf8')) as {
        objects: Record<string, { geometries: { id?: string }[] }>;
      };
      const geoms = topo.objects['countries']?.geometries ?? [];
      assert(
        geoms.length >= GEO.minFeatures && geoms.length <= GEO.maxFeatures,
        `${geoms.length} features`,
      );
      for (const g of geoms)
        assert(
          g.id && /^_?[A-Z]{3}$/.test(String(g.id)),
          `feature without valid id: ${JSON.stringify(g.id)}`,
        );
      const ids = new Set(geoms.map((g) => g.id));
      assert(ids.size === geoms.length, 'duplicate feature ids');
      assert(
        ids.has('TWN') && ids.has('XKX') && ids.has('PSE') && ids.has('ESH'),
        'expected overrides (TWN/XKX/PSE/ESH) not all present',
      );
      return `${geoms.length} features, ${(bytes / 1024).toFixed(0)} KB`;
    });
  }

  // ---------- core ----------
  if (groupsProduced.core) {
    guard('schema: stock files', 'core', () => {
      assert(manifest && manifest.stock_files.length >= 1, 'no stock files in manifest');
      assert(stockFiles.length === manifest.stock_files.length, 'stock file unreadable');
      for (const s of stockFiles) StockSchema.parse(s);
      return manifest.stock_files.join(', ');
    });
    guard('#6 no NaN/Infinity/negative values (stock)', 'core', () => {
      let n = 0;
      for (const s of stockFiles) {
        for (const view of ['asylum', 'origin'] as const) {
          for (const [k, e] of Object.entries(s[view])) {
            for (const series of e.v) {
              for (const v of unpack(series)) {
                if (v === null) continue;
                assert(
                  Number.isFinite(v) && v >= 0 && Number.isInteger(v),
                  `${view}/${k}: bad value ${v}`,
                );
                n++;
              }
            }
          }
        }
      }
      // country files: packed series + demographics + flows spot-checked with the same rules
      const cdir = join(IN, 'country');
      let cn = 0;
      if (existsSync(cdir)) {
        for (const fname of readdirSync(cdir).filter((f) => f.endsWith('.json'))) {
          const cf = readJsonIfExists<CountryFile>(join(cdir, fname));
          if (!cf) continue;
          for (const packed of [...cf.asylum.v, ...cf.origin.v, cf.population]) {
            for (const val of unpack(packed)) {
              if (val === null) continue;
              assert(
                Number.isFinite(val) && val >= 0 && Number.isInteger(val),
                `${fname}: bad value ${val}`,
              );
              cn++;
            }
          }
          for (const d of cf.demographics)
            for (const val of [...d.f, ...d.m, d.total]) {
              if (val === null) continue;
              assert(Number.isFinite(val) && val >= 0, `${fname}: bad demographics value ${val}`);
            }
        }
      }
      const fdir = join(IN, 'flows');
      if (existsSync(fdir)) {
        for (const fname of readdirSync(fdir).filter((f) => f.endsWith('.json'))) {
          const fl = readJsonIfExists<{ rows: [string, string, number | null, number | null][] }>(
            join(fdir, fname),
          );
          for (const row of fl?.rows ?? [])
            for (const val of [row[2], row[3]]) {
              if (val === null) continue;
              assert(Number.isFinite(val) && val >= 0, `flows/${fname}: bad value ${val}`);
            }
        }
      }
      return `${n} stock + ${cn} country values`;
    });
    guard('#7 null vs 0 distinguishable after codec round-trip (stock)', 'core', () => {
      let nulls = 0,
        zeros = 0,
        series = 0;
      for (const s of stockFiles) {
        for (const view of ['asylum', 'origin'] as const) {
          for (const e of Object.values(s[view])) {
            for (const p of e.v) {
              Packed.parse(p); // structural: number | null | ['z'|'n', n]
              const u = unpack(p);
              // the published form must be the canonical packing — a byte-identical round trip
              assert(
                JSON.stringify(pack(u)) === JSON.stringify(p),
                `${view}: pack(unpack(x)) !== x — codec drift`,
              );
              series++;
              for (const v of u) {
                if (v === null) nulls++;
                else if (v === 0) zeros++;
              }
            }
          }
        }
      }
      assert(nulls > 0 && zeros > 0, `expected both nulls (${nulls}) and zeros (${zeros}) in data`);
      return `${series} series round-tripped; ${nulls} nulls and ${zeros} zeros coexist`;
    });
    guard('#3 max year ≥ previous snapshot', 'core', () => {
      assert(manifest, 'manifest missing');
      if (!prevManifest) return 'no previous snapshot';
      assert(
        manifest.year_max >= prevManifest.year_max,
        `year_max went backwards: ${manifest.year_max} < ${prevManifest.year_max}`,
      );
      return `${prevManifest.year_max} → ${manifest.year_max}`;
    });
    guard('#4 global totals drift < 20% vs previous (per metric/year)', 'core', () => {
      if (!prevManifest) return 'no previous snapshot';
      const prevStocks = prevManifest.stock_files
        .map((f) => readJsonIfExists<StockFile>(join(PREV, f)))
        .filter((x): x is StockFile => !!x);
      const prevTotals = new Map<string, number | null>();
      for (const s of prevStocks)
        s.totals.asylum.forEach((p, mi) =>
          unpack(p).forEach((v, yi) => prevTotals.set(`${METRIC_IDS[mi]}|${s.years[yi]}`, v)),
        );
      const drifts: string[] = [];
      let compared = 0;
      for (const s of stockFiles) {
        s.totals.asylum.forEach((p, mi) =>
          unpack(p).forEach((v, yi) => {
            const key = `${METRIC_IDS[mi]}|${s.years[yi]}`;
            const pv = prevTotals.get(key);
            if (pv === undefined || pv === null || v === null || pv < 1000) return; // new year or tiny
            compared++;
            const d = Math.abs(v - pv) / pv;
            if (d > THRESHOLDS.maxTotalDrift)
              drifts.push(`${key}: ${pv} → ${v} (${(d * 100).toFixed(0)}%)`);
          }),
        );
      }
      assert(!drifts.length, `drift: ${drifts.slice(0, 5).join('; ')}`);
      return `${compared} totals within ${THRESHOLDS.maxTotalDrift * 100}%`;
    });
    guard('#5 ★ mapped total + unmappable total == global total', 'core', () => {
      assert(countries && geoIndex, 'countries/geo missing');
      const fillable = new Set(
        Object.entries(geoIndex.features)
          .filter(([, f]) => f.fill)
          .map(([k]) => k),
      );
      const inGeoMeta = new Map(countries.countries.map((c) => [c.iso3, c.in_geo]));
      let checked = 0;
      for (const s of stockFiles) {
        for (let mi = 0; mi < METRIC_IDS.length; mi++) {
          for (let yi = 0; yi < s.years.length; yi++) {
            let mapped: number | null = null,
              unmappable: number | null = null;
            for (const [k, e] of Object.entries(s.asylum)) {
              const v = unpack(e.v[mi]!)[yi] ?? null;
              if (v === null) continue;
              const drawable = fillable.has(k) && inGeoMeta.get(k);
              if (drawable) mapped = (mapped ?? 0) + v;
              else {
                unmappable = (unmappable ?? 0) + v;
                assert(
                  s.unmappable.includes(k),
                  `${k} has data but is not listed in unmappable (${METRIC_IDS[mi]} ${s.years[yi]})`,
                );
              }
            }
            const total = unpack(s.totals.asylum[mi]!)[yi] ?? null;
            const lhs = (mapped ?? 0) + (unmappable ?? 0);
            assert(
              total === (mapped === null && unmappable === null ? null : lhs),
              `${METRIC_IDS[mi]} ${s.years[yi]}: mapped ${mapped} + unmappable ${unmappable} != total ${total}`,
            );
            checked++;
          }
        }
      }
      return `holds for all ${METRIC_IDS.length} metrics × ${checked / METRIC_IDS.length} years`;
    });
    guard(
      '#10 every country JSON iso3 exists in countries.json and (geometry or pseudo whitelist)',
      'core',
      () => {
        assert(countries, 'missing');
        const dir = join(IN, 'country');
        const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
        assert(files.length > 200, `only ${files.length} country files`);
        const known = new Set(countries.countries.map((c) => c.iso3));
        const geoKeys = new Set(Object.keys(geoIndex?.features ?? {}));
        let checked = 0;
        for (const f of files) {
          const iso3 = f.replace('.json', '');
          assert(known.has(iso3), `${f}: not in countries.json`);
          const meta = countries.countries.find((c) => c.iso3 === iso3)!;
          const okGeo = geoKeys.has(iso3) || NON_GEO_ENTITIES.has(iso3) || !meta.in_geo;
          assert(okGeo, `${iso3}: claims in_geo but no geometry`);
          if (
            checked < 40 ||
            ['SYR', 'TUR', 'DEU', 'AUT', 'AUS', 'EGY', 'ARE', 'MTQ', 'MAR', 'TWN', 'XKX'].includes(
              iso3,
            )
          ) {
            const c = readJsonIfExists<CountryFile>(join(dir, f));
            assert(c, `${f}: unreadable`);
            const r = CountrySchema.safeParse(c);
            assert(
              r.success,
              `${f}: ${r.success ? '' : r.error.issues[0]?.path.join('.') + ' ' + r.error.issues[0]?.message}`,
            );
            assert(c.iso3 === iso3 && c.meta.iso3 === iso3, `${f}: iso3 mismatch`);
            assert(
              c.years.length === manifest!.year_max - manifest!.year_min + 1,
              `${f}: years length`,
            );
            checked++;
          }
        }
        return `${files.length} files, ${checked} deep-checked`;
      },
    );
    guard('#11 unmatched-report has no entity > 10,000 persons', 'core', () => {
      const r = readJsonIfExists<{ entries: { raw: string; max_value: number }[] }>(
        join(IN, 'unmatched-report.json'),
      );
      assert(r, 'unmatched-report.json missing');
      const big = r.entries.filter((e) => e.max_value > THRESHOLDS.unmatchedFailAbove);
      assert(!big.length, big.map((b) => `${b.raw}:${b.max_value}`).join(', '));
      return `${r.entries.length} small unmatched entries`;
    });
    guard('#13 ★ golden numbers', 'core', () => {
      const results: string[] = [];
      for (const g of GOLDEN) {
        const tol = GOLDEN_TOLERANCE_OVERRIDE[g.id] ?? THRESHOLDS.goldenTolerance;
        const mi = METRIC_IDS.indexOf(g.metric);
        let actual: number | null = null;
        for (const s of stockFiles) {
          const yi = s.years.indexOf(g.year);
          if (yi < 0) continue;
          if (g.iso3 === 'WORLD') actual = unpack(s.totals[g.view][mi]!)[yi] ?? null;
          else actual = s[g.view][g.iso3] ? (unpack(s[g.view][g.iso3]!.v[mi]!)[yi] ?? null) : null;
        }
        assert(actual !== null, `${g.id}: no value found`);
        const err = Math.abs(actual - g.expected) / g.expected;
        assert(
          err <= tol,
          `${g.id}: expected ${g.expected}, got ${actual} (${(err * 100).toFixed(2)}% > ${tol * 100}%)`,
        );
        results.push(`${g.id}=${actual}`);
      }
      return results.join(', ');
    });
    guard('downloads present + CSV header carries provenance', 'core', () => {
      const p = join(IN, 'downloads/unhcr-population-all-years.csv');
      assert(existsSync(p), 'long CSV missing');
      const head = readFileSync(p, 'utf8').slice(0, 300).split('\n')[0]!;
      assert(!head.startsWith('#'), 'CSV must not start with comment lines');
      for (const col of [
        'iso3',
        'year',
        'metric',
        'value',
        'source_id',
        'data_as_of',
        'retrieved_at',
        'snapshot_id',
      ])
        assert(head.includes(col), `header missing ${col}`);
      return head;
    });
  }

  // ---------- live ----------
  if (groupsProduced.nowcast) {
    guard('nowcast.json shape', 'nowcast', () => {
      const n = readJsonIfExists<{
        rows: { iso3: string; refugees: number | null }[];
        period: string;
      }>(join(IN, 'live/nowcast.json'));
      assert(n && Array.isArray(n.rows) && n.rows.length > 50, 'too few rows');
      assert(/^\d{4}(-\d{2})?$/.test(n.period), `bad period ${n.period}`);
      return `${n.rows.length} rows, ${n.period}`;
    });
  }
  if (groupsProduced.idu) {
    guard('idu-latest.json shape + no HTML', 'idu', () => {
      const f = readJsonIfExists<{
        events: { text: string; iso3: string; lat: number | null }[];
        count: number;
      }>(join(IN, 'live/idu-latest.json'));
      assert(f && f.events.length > 100, 'too few events');
      for (const e of f.events)
        assert(!/<[a-z!/]/i.test(e.text), `HTML leaked into event text: ${e.text.slice(0, 60)}`);
      return `${f.events.length} events`;
    });
  }

  // ---------- summary ----------
  const groups: Record<Group, boolean> = {
    countries: true,
    geo: true,
    core: true,
    nowcast: true,
    idu: true,
    meta: true,
  };
  for (const c of checks) if (!c.ok) groups[c.group] = false;
  for (const g of Object.keys(groups) as Group[]) if (!groupsProduced[g]) groups[g] = false;
  const failed = checks.filter((c) => !c.ok);
  log.group('validation summary');
  log.info(
    `${checks.length - failed.length}/${checks.length} checks passed; groups: ${JSON.stringify(groups)}`,
  );
  writeJsonAtomic(
    join(
      isSelfCheck ? PATHS.staging : IN,
      isSelfCheck ? '_validation-public.json' : '_validation.json',
    ),
    { validated_at: new Date().toISOString(), input: IN, groups, produced: groupsProduced, checks },
    true,
  );
  const coreFail = failed.some(
    (c) => c.group === 'core' || c.group === 'meta' || c.group === 'countries',
  );
  if ((STRICT && failed.length) || coreFail) {
    log.error(`validation FAILED: ${failed.map((f) => f.id).join(' | ')}`);
    process.exit(1);
  }
  log.ok('validation passed');
}

main();
export { SOURCE_IDS };
