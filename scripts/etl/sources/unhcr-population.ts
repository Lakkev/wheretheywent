/**
 * /population/ — the core stock figures (§7.4).
 *   A. by country of asylum  (coa_all=true)  → "asylum" view
 *   B. by country of origin  (coo_all=true)  → "origin" view
 *   C. bilateral matrix      (coo_all & coa_all) → top partners per country + Phase 2 flows
 * Footnotes (§10.5) are fetched for A and B with identical parameters.
 */
import { METRIC_IDS, type MetricId } from '../../../src/lib/types.ts';
import { YEARS } from '../config.ts';
import { fetchUnhcr, num, iso, year, type RawRow } from './unhcr.ts';
import type { CodeRegistry } from '../lib/codes.ts';
import { log } from '../lib/log.ts';

/** country key → year → metric values (aligned with METRIC_IDS) */
export type StockMap = Map<string, Map<number, (number | null)[]>>;

export interface BilateralRow {
  year: number;
  coo: string; // canonical key (origin)
  coa: string; // canonical key (asylum)
  refugees: number | null;
  asylum_seekers: number | null;
  idps: number | null;
  returned_refugees: number | null;
  returned_idps: number | null;
  stateless: number | null;
  ooc: number | null;
  oip: number | null;
  hst: number | null;
}

export interface UnmatchedEntry {
  source: string;
  raw: string;
  field: string;
  rows: number;
  max_value: number;
  years: [number, number];
}

export interface PopulationResult {
  asylum: StockMap;
  origin: StockMap;
  bilateral: BilateralRow[];
  unmatched: UnmatchedEntry[];
  hash: string;
  urls: string[];
  rowCounts: { asylum: number; origin: number; bilateral: number };
}

function metricValues(r: RawRow): (number | null)[] {
  return METRIC_IDS.map((m) => num(r, m));
}

class UnmatchedTracker {
  map = new Map<string, UnmatchedEntry>();
  add(source: string, field: string, raw: string, y: number, values: (number | null)[]) {
    const k = `${source}|${field}|${raw}`;
    const mx = Math.max(0, ...values.map((v) => v ?? 0));
    const e = this.map.get(k);
    if (e) {
      e.rows++;
      e.max_value = Math.max(e.max_value, mx);
      e.years = [Math.min(e.years[0], y), Math.max(e.years[1], y)];
    } else this.map.set(k, { source, field, raw, rows: 1, max_value: mx, years: [y, y] });
  }
  list() {
    return [...this.map.values()].sort((a, b) => b.max_value - a.max_value);
  }
}

/**
 * Aggregate rows into a StockMap keyed by `field`. Unmatched keys: bucket into OTH (§7.7 step 5);
 * the caller decides FAIL if any unmatched entry exceeds the threshold (step 4).
 */
function aggregate(
  rows: RawRow[],
  field: 'coo_iso' | 'coa_iso',
  reg: CodeRegistry,
  tracker: UnmatchedTracker,
  src: string,
): StockMap {
  const out: StockMap = new Map();
  for (const r of rows) {
    const y = year(r);
    const n = reg.normalize(iso(r, field));
    if (n.key === null) continue; // aggregate marker "-"
    const vals = metricValues(r);
    let key = n.key;
    if (!n.matched) {
      tracker.add(src, field, n.raw, y, vals);
      key = 'OTH';
    }
    let byYear = out.get(key);
    if (!byYear) out.set(key, (byYear = new Map()));
    const prev = byYear.get(y);
    if (!prev) byYear.set(y, vals);
    else {
      // sum (null + x = x; null + null = null)
      byYear.set(
        y,
        prev.map((a, i) => {
          const b = vals[i]!;
          if (a === null) return b;
          if (b === null) return a;
          return a + b;
        }),
      );
    }
  }
  return out;
}

export async function fetchPopulation(
  maxYear: number,
  reg: CodeRegistry,
): Promise<PopulationResult> {
  const base = { yearFrom: YEARS.min, yearTo: maxYear };
  const [a, b, c] = await Promise.all([
    fetchUnhcr('population', { ...base, coa_all: true }, 'population/asylum'),
    fetchUnhcr('population', { ...base, coo_all: true }, 'population/origin'),
    fetchUnhcr('population', { ...base, coo_all: true, coa_all: true }, 'population/bilateral'),
  ]);
  const tracker = new UnmatchedTracker();
  const asylum = aggregate(a.rows, 'coa_iso', reg, tracker, 'population/asylum');
  const origin = aggregate(b.rows, 'coo_iso', reg, tracker, 'population/origin');

  const bilateral: BilateralRow[] = [];
  for (const r of c.rows) {
    const y = year(r);
    const o = reg.normalize(iso(r, 'coo_iso'));
    const h = reg.normalize(iso(r, 'coa_iso'));
    if (o.key === null || h.key === null) continue;
    const vals = metricValues(r);
    if (!o.matched) tracker.add('population/bilateral', 'coo_iso', o.raw, y, vals);
    if (!h.matched) tracker.add('population/bilateral', 'coa_iso', h.raw, y, vals);
    const v = (m: MetricId) => vals[METRIC_IDS.indexOf(m)]!;
    bilateral.push({
      year: y,
      coo: o.matched ? o.key : 'OTH',
      coa: h.matched ? h.key : 'OTH',
      refugees: v('refugees'),
      asylum_seekers: v('asylum_seekers'),
      idps: v('idps'),
      returned_refugees: v('returned_refugees'),
      returned_idps: v('returned_idps'),
      stateless: v('stateless'),
      ooc: v('ooc'),
      oip: v('oip'),
      hst: v('hst'),
    });
  }
  log.info(
    `population: asylum ${asylum.size} keys, origin ${origin.size} keys, bilateral ${bilateral.length} rows`,
  );
  return {
    asylum,
    origin,
    bilateral,
    unmatched: tracker.list(),
    hash: [a.hash, b.hash, c.hash].join('+'),
    urls: [a.url, b.url, c.url],
    rowCounts: { asylum: a.totalRows, origin: b.totalRows, bilateral: c.totalRows },
  };
}
