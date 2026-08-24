/**
 * Secondary UNHCR endpoints feeding country detail files:
 *   demographics (2010+, coa), idmc (2009+, coo), solutions (2000+, coo×coa),
 *   asylum-applications (2015+, app_pc=P only), footnotes (population queries), nowcasting.
 */
import { YEARS } from '../config.ts';
import { fetchUnhcr, num, iso, year, type RawRow } from './unhcr.ts';
import { UnmatchedTracker, type UnmatchedEntry } from './unhcr-population.ts';
import type { CodeRegistry } from '../lib/codes.ts';
import type {
  DemographicsRow,
  SolutionsRow,
  IdmcRow,
  Footnote,
  NowcastRow,
} from '../../../src/lib/types.ts';
import { log } from '../lib/log.ts';

export interface SecondaryResult<T> {
  byKey: Map<string, T[]>;
  hash: string;
  urls: string[];
  rows: number;
  /** Codes that could not be matched to a known entity, with the largest value seen (§7.7). */
  unmatched: UnmatchedEntry[];
}

const DEMO_F = ['f_0_4', 'f_5_11', 'f_12_17', 'f_18_59', 'f_60', 'f_other', 'f_total'];
const DEMO_M = ['m_0_4', 'm_5_11', 'm_12_17', 'm_18_59', 'm_60', 'm_other', 'm_total'];

export async function fetchDemographics(
  maxYear: number,
  reg: CodeRegistry,
): Promise<SecondaryResult<DemographicsRow>> {
  // per-year requests (each ~180 rows) keep payloads small and let partial years stream
  const years: number[] = [];
  for (let y = YEARS.demographicsFrom; y <= maxYear; y++) years.push(y);
  const results = await Promise.all(
    years.map((y) => fetchUnhcr('demographics', { year: y, coa_all: true }, `demographics/${y}`)),
  );
  const byKey = new Map<string, DemographicsRow[]>();
  const tracker = new UnmatchedTracker();
  let rows = 0;
  for (const res of results) {
    for (const r of res.rows) {
      const n = reg.normalize(iso(r, 'coa_iso'));
      if (!n.key) continue;
      if (!n.matched) {
        tracker.add('demographics', 'coa_iso', n.raw, year(r), [num(r, 'total')]);
        continue;
      }
      rows++;
      const row: DemographicsRow = {
        year: year(r),
        f: DEMO_F.map((f) => num(r, f)),
        m: DEMO_M.map((f) => num(r, f)),
        total: num(r, 'total'),
      };
      const arr = byKey.get(n.key) ?? [];
      arr.push(row);
      byKey.set(n.key, arr);
    }
  }
  for (const arr of byKey.values()) arr.sort((a, b) => a.year - b.year);
  log.info(`demographics: ${rows} rows, ${byKey.size} countries`);
  return {
    byKey,
    hash: results.map((r) => r.hash).join('+'),
    urls: results.map((r) => r.url),
    rows,
    unmatched: tracker.list(),
  };
}

export async function fetchIdmc(
  maxYear: number,
  reg: CodeRegistry,
): Promise<SecondaryResult<IdmcRow>> {
  const res = await fetchUnhcr(
    'idmc',
    { yearFrom: YEARS.idmcFrom, yearTo: maxYear, coo_all: true },
    'idmc',
  );
  const byKey = new Map<string, IdmcRow[]>();
  const tracker = new UnmatchedTracker();
  for (const r of res.rows) {
    const n = reg.normalize(iso(r, 'coo_iso'));
    if (!n.key) continue;
    if (!n.matched) tracker.add('idmc', 'coo_iso', n.raw, year(r), [num(r, 'total')]);
    const key = n.matched ? n.key : 'OTH';
    const arr = byKey.get(key) ?? [];
    arr.push({ year: year(r), total: num(r, 'total') });
    byKey.set(key, arr);
  }
  for (const arr of byKey.values()) arr.sort((a, b) => a.year - b.year);
  log.info(`idmc: ${res.rows.length} rows, ${byKey.size} countries`);
  return {
    byKey,
    hash: res.hash,
    urls: [res.url],
    rows: res.rows.length,
    unmatched: tracker.list(),
  };
}

/** Solutions aggregated per country-of-origin (returns/resettlement/naturalisation of people FROM the country). */
export async function fetchSolutions(
  maxYear: number,
  reg: CodeRegistry,
): Promise<SecondaryResult<SolutionsRow> & { byHost: Map<string, SolutionsRow[]> }> {
  const res = await fetchUnhcr(
    'solutions',
    { yearFrom: YEARS.solutionsFrom, yearTo: maxYear, coo_all: true, coa_all: true },
    'solutions',
  );
  const tracker = new UnmatchedTracker();
  const agg = (field: 'coo_iso' | 'coa_iso') => {
    const byKey = new Map<string, Map<number, SolutionsRow>>();
    for (const r of res.rows) {
      const n = reg.normalize(iso(r, field));
      if (!n.key) continue;
      if (!n.matched && field === 'coo_iso')
        tracker.add('solutions', field, n.raw, year(r), [
          num(r, 'returned_refugees'),
          num(r, 'resettlement'),
          num(r, 'naturalisation'),
          num(r, 'returned_idps'),
        ]);
      const key = n.matched ? n.key : 'OTH';
      const y = year(r);
      let m = byKey.get(key);
      if (!m) byKey.set(key, (m = new Map()));
      const cur = m.get(y) ?? {
        year: y,
        returned_refugees: null,
        resettlement: null,
        naturalisation: null,
        returned_idps: null,
      };
      const add = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : a + b);
      cur.returned_refugees = add(cur.returned_refugees, num(r, 'returned_refugees'));
      cur.resettlement = add(cur.resettlement, num(r, 'resettlement'));
      cur.naturalisation = add(cur.naturalisation, num(r, 'naturalisation'));
      cur.returned_idps = add(cur.returned_idps, num(r, 'returned_idps'));
      m.set(y, cur);
    }
    const out = new Map<string, SolutionsRow[]>();
    for (const [k, m] of byKey)
      out.set(
        k,
        [...m.values()].sort((a, b) => a.year - b.year),
      );
    return out;
  };
  const byKey = agg('coo_iso');
  const byHost = agg('coa_iso');
  log.info(`solutions: ${res.rows.length} rows`);
  return {
    byKey,
    byHost,
    hash: res.hash,
    urls: [res.url],
    rows: res.rows.length,
    unmatched: tracker.list(),
  };
}

export interface AsylumAppRow {
  year: number;
  applied: number | null;
}
/** Asylum applications (persons only, app_pc=P) aggregated by country of asylum and by origin. */
export async function fetchAsylumApplications(maxYear: number, reg: CodeRegistry) {
  const res = await fetchUnhcr(
    'asylum-applications',
    { yearFrom: YEARS.asylumAppsFrom, yearTo: maxYear, coo_all: true, coa_all: true },
    'asylum-applications',
  );
  let kept = 0;
  const tracker = new UnmatchedTracker();
  const agg = (field: 'coo_iso' | 'coa_iso') => {
    const byKey = new Map<string, Map<number, number | null>>();
    for (const r of res.rows) {
      if (String(r.app_pc ?? '').toUpperCase() !== 'P') continue; // §3.7: never mix C and P
      const n = reg.normalize(iso(r, field));
      if (!n.key) continue;
      if (!n.matched && field === 'coa_iso')
        tracker.add('asylum-applications', field, n.raw, year(r), [num(r, 'applied')]);
      const key = n.matched ? n.key : 'OTH';
      const y = year(r);
      let m = byKey.get(key);
      if (!m) byKey.set(key, (m = new Map()));
      const v = num(r, 'applied');
      const cur = m.get(y);
      m.set(y, cur === undefined || cur === null ? v : v === null ? cur : cur + v);
    }
    const out = new Map<string, AsylumAppRow[]>();
    for (const [k, m] of byKey)
      out.set(
        k,
        [...m.entries()]
          .map(([year, applied]) => ({ year, applied }))
          .sort((a, b) => a.year - b.year),
      );
    return out;
  };
  for (const r of res.rows) if (String(r.app_pc ?? '').toUpperCase() === 'P') kept++;
  const byHost = agg('coa_iso');
  const byOrigin = agg('coo_iso');
  log.info(`asylum-applications: ${res.rows.length} rows, ${kept} person-based kept`);
  return {
    byHost,
    byOrigin,
    hash: res.hash,
    urls: [res.url],
    rows: res.rows.length,
    unmatched: tracker.list(),
  };
}

/** Footnotes for the asylum and origin population queries (same params as /population/). */
export async function fetchFootnotes(
  maxYear: number,
  reg: CodeRegistry,
): Promise<SecondaryResult<Footnote>> {
  const base = { yearFrom: YEARS.min, yearTo: maxYear };
  const [a, b] = await Promise.all([
    fetchUnhcr('footnotes', { ...base, coa_all: true }, 'footnotes/asylum'),
    fetchUnhcr('footnotes', { ...base, coo_all: true }, 'footnotes/origin'),
  ]);
  const byKey = new Map<string, Footnote[]>();
  const seen = new Set<string>();
  const take = (rows: RawRow[], field: 'coo_iso' | 'coa_iso', view: 'asylum' | 'origin') => {
    for (const r of rows) {
      const n = reg.normalize(iso(r, field));
      if (!n.key || !n.matched) continue;
      const text = String(r.footnote ?? '').trim();
      if (!text) continue;
      const yNum = Number(r.year); // string in this endpoint (§3.7); may be empty = applies to all years
      const y = Number.isInteger(yNum) && yNum > 0 ? yNum : null;
      const fn: Footnote = {
        year: y,
        population_type: String(r.population_type ?? ''),
        text,
        view,
      };
      const dedupe = `${n.key}|${y}|${fn.population_type}|${view}|${text}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const arr = byKey.get(n.key) ?? [];
      arr.push(fn);
      byKey.set(n.key, arr);
    }
  };
  take(a.rows, 'coa_iso', 'asylum');
  take(b.rows, 'coo_iso', 'origin');
  for (const arr of byKey.values())
    arr.sort(
      (x, y) => (x.year ?? 0) - (y.year ?? 0) || x.population_type.localeCompare(y.population_type),
    );
  log.info(`footnotes: ${a.rows.length + b.rows.length} rows, ${byKey.size} countries`);
  return {
    byKey,
    hash: a.hash + '+' + b.hash,
    urls: [a.url, b.url],
    rows: a.rows.length + b.rows.length,
    // text-only source: unmatched rows carry no population figures, nothing to threshold
    unmatched: [],
  };
}

export async function fetchNowcasting(reg: CodeRegistry): Promise<{
  rows: NowcastRow[];
  period: string;
  hash: string;
  url: string;
  unmatched: UnmatchedEntry[];
}> {
  const res = await fetchUnhcr('nowcasting', { coa_all: true }, 'nowcasting');
  const rows: NowcastRow[] = [];
  const tracker = new UnmatchedTracker();
  let period = '';
  for (const r of res.rows) {
    const n = reg.normalize(iso(r, 'coa_iso'));
    if (!n.key) continue;
    if (!n.matched) {
      tracker.add('nowcasting', 'coa_iso', n.raw, Number(r.year) || 0, [
        num(r, 'refugees'),
        num(r, 'asylum_seekers'),
      ]);
      continue;
    }
    rows.push({
      iso3: n.key,
      refugees: num(r, 'refugees'),
      asylum_seekers: num(r, 'asylum_seekers'),
      source: String(r.source ?? ''),
    });
    if (!period) {
      const y = Number(r.year);
      const mName = String(r.month ?? '');
      const mIdx = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ].indexOf(mName);
      period = mIdx >= 0 ? `${y}-${String(mIdx + 1).padStart(2, '0')}` : `${y}`;
    }
  }
  log.info(`nowcasting: ${rows.length} rows, period ${period}`);
  return { rows, period, hash: res.hash, url: res.url, unmatched: tracker.list() };
}
