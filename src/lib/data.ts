/**
 * Client-side data access for /data/v1 (framework-free).
 *  - manifest-driven URLs with ?v=<sha8> (immutable caching, instant updates)
 *  - StockStore merges stock windows (first-screen + idle-prefetched history)
 *  - country files: in-flight dedupe + LRU(30)
 */
import { unpack } from './columnar';
import {
  METRIC_IDS,
  type AnyMetricId,
  type CountriesFile,
  type CountryFile,
  type CountryMeta,
  type Manifest,
  type MetricId,
  type MetricsFile,
  type SourcesFile,
  type StockFile,
  type ViewId,
  type DisputedNotes,
  type NowcastFile,
  type IduFile,
} from './types';

export const DATA_BASE = '/data/v1';

export const TOTAL_POC_COMPONENTS: MetricId[] = [
  'refugees',
  'asylum_seekers',
  'idps',
  'stateless',
  'ooc',
  'oip',
];

export class DataClient {
  manifest: Manifest | null = null;
  private base: string;
  constructor(base = DATA_BASE) {
    this.base = base;
  }
  async loadManifest(): Promise<Manifest> {
    const res = await fetch(`${this.base}/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    this.manifest = (await res.json()) as Manifest;
    return this.manifest;
  }
  url(rel: string): string {
    const h = this.manifest?.files[rel]?.sha256;
    return `${this.base}/${rel}${h ? `?v=${h.slice(0, 8)}` : ''}`;
  }
  async json<T>(rel: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(this.url(rel), { signal });
    if (!res.ok) throw new Error(`${rel} ${res.status}`);
    return (await res.json()) as T;
  }
  countries() {
    return this.json<CountriesFile>('countries.json');
  }
  sources() {
    return this.json<SourcesFile>('sources.json');
  }
  metrics() {
    return this.json<MetricsFile>('metrics.json');
  }
  geo() {
    return this.json<import('topojson-specification').Topology>('geo/world-50m.topo.json');
  }
  disputed() {
    return this.json<DisputedNotes>('geo/disputed-notes.json');
  }
  nowcast() {
    return this.json<NowcastFile>('live/nowcast.json');
  }
  idu() {
    return this.json<IduFile>('live/idu-latest.json');
  }
  stock(rel: string) {
    return this.json<StockFile>(rel);
  }

  // ---- country files: dedupe + LRU ----
  private inflight = new Map<string, Promise<CountryFile>>();
  private lru = new Map<string, CountryFile>();
  private LRU_MAX = 30;
  async country(iso3: string): Promise<CountryFile> {
    const hit = this.lru.get(iso3);
    if (hit) {
      this.lru.delete(iso3);
      this.lru.set(iso3, hit); // refresh recency
      return hit;
    }
    let p = this.inflight.get(iso3);
    if (!p) {
      p = this.json<CountryFile>(`country/${iso3}.json`)
        .then((f) => {
          this.lru.set(iso3, f);
          if (this.lru.size > this.LRU_MAX) this.lru.delete(this.lru.keys().next().value!);
          return f;
        })
        .finally(() => this.inflight.delete(iso3));
      this.inflight.set(iso3, p);
    }
    return p;
  }
  hasCountry(iso3: string) {
    return this.lru.has(iso3);
  }
  peekCountry(iso3: string) {
    return this.lru.get(iso3) ?? null;
  }
}

/** Unpacked view series for one key: metric index → year index → value. */
type Series = (number | null)[][];

/**
 * Merges one or more StockFiles into a year-indexed store. Values are unpacked eagerly
 * (≈400 keys × 9 metrics × 75 years ≈ 270k numbers — trivial) so year scrubbing is O(1) per country.
 */
export class StockStore {
  years: number[] = [];
  private yearIndex = new Map<number, number>();
  private asylum = new Map<string, Series>();
  private origin = new Map<string, Series>();
  private population = new Map<string, (number | null)[]>();
  private totals: { asylum: Series; origin: Series } = { asylum: [], origin: [] };
  unmappable = new Set<string>();
  loadedFiles = new Set<string>();

  get metricCount() {
    return METRIC_IDS.length;
  }

  /** Add a stock window. Windows may arrive in any order; years are kept sorted. */
  add(file: StockFile, name: string) {
    if (this.loadedFiles.has(name)) return;
    this.loadedFiles.add(name);
    const newYears = [...new Set([...this.years, ...file.years])].sort((a, b) => a - b);
    const remap = (
      old: Series,
      oldYears: number[],
      add: Series | null,
      addYears: number[],
    ): Series => {
      const out: Series = METRIC_IDS.map(() => newYears.map(() => null));
      oldYears.forEach((y, yi) => {
        const ni = newYears.indexOf(y);
        for (let mi = 0; mi < METRIC_IDS.length; mi++) out[mi]![ni] = old[mi]?.[yi] ?? null;
      });
      if (add)
        addYears.forEach((y, yi) => {
          const ni = newYears.indexOf(y);
          for (let mi = 0; mi < METRIC_IDS.length; mi++) out[mi]![ni] = add[mi]?.[yi] ?? null;
        });
      return out;
    };
    const remap1 = (
      old: (number | null)[],
      oldYears: number[],
      add: (number | null)[] | null,
      addYears: number[],
    ) => {
      const out: (number | null)[] = newYears.map(() => null);
      oldYears.forEach((y, yi) => (out[newYears.indexOf(y)] = old[yi] ?? null));
      if (add) addYears.forEach((y, yi) => (out[newYears.indexOf(y)] = add[yi] ?? null));
      return out;
    };
    const oldYears = this.years;
    for (const view of ['asylum', 'origin'] as const) {
      const target = view === 'asylum' ? this.asylum : this.origin;
      const keys = new Set([...target.keys(), ...Object.keys(file[view])]);
      for (const k of keys) {
        const old = target.get(k) ?? METRIC_IDS.map(() => oldYears.map(() => null));
        const packed = file[view][k];
        const add = packed ? packed.v.map((s) => unpack(s)) : null;
        target.set(k, remap(old, oldYears, add, file.years));
      }
      const oldT = this.totals[view].length
        ? this.totals[view]
        : METRIC_IDS.map(() => oldYears.map(() => null));
      this.totals[view] = remap(
        oldT,
        oldYears,
        file.totals[view].map((s) => unpack(s)),
        file.years,
      );
    }
    const popKeys = new Set([...this.population.keys(), ...Object.keys(file.population)]);
    for (const k of popKeys) {
      const old = this.population.get(k) ?? oldYears.map(() => null);
      const packed = file.population[k];
      this.population.set(k, remap1(old, oldYears, packed ? unpack(packed) : null, file.years));
    }
    for (const u of file.unmappable) this.unmappable.add(u);
    this.years = newYears;
    this.yearIndex = new Map(newYears.map((y, i) => [y, i]));
  }

  hasYear(y: number) {
    return this.yearIndex.has(y);
  }
  keys(view: ViewId): IterableIterator<string> {
    return (view === 'asylum' ? this.asylum : this.origin).keys();
  }
  /** Raw metric value (persons) or null. */
  value(view: ViewId, iso3: string, metric: AnyMetricId, year: number): number | null {
    const yi = this.yearIndex.get(year);
    if (yi === undefined) return null;
    const s = (view === 'asylum' ? this.asylum : this.origin).get(iso3);
    if (!s) return null;
    if (metric === 'total_poc') return sumComponents(s, yi);
    return s[METRIC_IDS.indexOf(metric)]?.[yi] ?? null;
  }
  pop(iso3: string, year: number): number | null {
    const yi = this.yearIndex.get(year);
    if (yi === undefined) return null;
    return this.population.get(iso3)?.[yi] ?? null;
  }
  /** Per-1,000 residents; null when either side is missing or population is 0. */
  per1k(view: ViewId, iso3: string, metric: AnyMetricId, year: number): number | null {
    const v = this.value(view, iso3, metric, year);
    const p = this.pop(iso3, year);
    if (v === null || p === null || p <= 0) return null;
    return (v / p) * 1000;
  }
  total(view: ViewId, metric: AnyMetricId, year: number): number | null {
    const yi = this.yearIndex.get(year);
    if (yi === undefined) return null;
    const t = this.totals[view];
    if (!t.length) return null;
    if (metric === 'total_poc') return sumComponents(t, yi);
    return t[METRIC_IDS.indexOf(metric)]?.[yi] ?? null;
  }
  /** Full series for one key/metric across loaded years (aligned with this.years). */
  series(view: ViewId, iso3: string, metric: AnyMetricId): (number | null)[] {
    const s = (view === 'asylum' ? this.asylum : this.origin).get(iso3);
    if (!s) return this.years.map(() => null);
    if (metric === 'total_poc') return this.years.map((_, yi) => sumComponents(s, yi));
    return s[METRIC_IDS.indexOf(metric)] ?? this.years.map(() => null);
  }
  totalSeries(view: ViewId, metric: AnyMetricId): (number | null)[] {
    const t = this.totals[view];
    if (!t.length) return this.years.map(() => null);
    if (metric === 'total_poc') return this.years.map((_, yi) => sumComponents(t, yi));
    return t[METRIC_IDS.indexOf(metric)] ?? this.years.map(() => null);
  }
}

function sumComponents(s: Series, yi: number): number | null {
  let sum: number | null = null;
  for (const m of TOTAL_POC_COMPONENTS) {
    const v = s[METRIC_IDS.indexOf(m)]?.[yi];
    if (v !== null && v !== undefined) sum = (sum ?? 0) + v;
  }
  return sum;
}

export function indexCountries(file: CountriesFile): Map<string, CountryMeta> {
  return new Map(file.countries.map((c) => [c.iso3, c]));
}

/** Display name for the locale (falls back to display_name). */
export function displayName(
  meta: CountryMeta | undefined,
  locale: 'en' | 'zh-Hant',
  iso3?: string,
): string {
  if (!meta) return iso3 ?? '';
  if (locale === 'zh-Hant' && meta.display_name_zh) return meta.display_name_zh;
  return meta.display_name;
}

/** requestIdleCallback with fallback. */
export function onIdle(fn: () => void, timeout = 2000) {
  const w = globalThis as unknown as {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 300);
}

/**
 * UNHCR /footnotes/ population_type codes mapped to our metrics (§10.5). Empty list = matches all
 * (used for the derived total). Codes observed/documented: REF, ROC (refugee-like), ASY, IDP,
 * IOC (IDP-like), STA, OOC, RET, RDP, OIP, HST.
 */
export const FOOTNOTE_TYPES: Record<string, string[]> = {
  refugees: ['REF', 'ROC'],
  asylum_seekers: ['ASY'],
  idps: ['IDP', 'IOC', 'IDS'],
  stateless: ['STA'],
  ooc: ['OOC'],
  returned_refugees: ['RET'],
  returned_idps: ['RDP'],
  oip: ['OIP', 'VDA'],
  hst: ['HST'],
  total_poc: [],
};

/** Does a footnote's population_type apply to the metric currently shown? */
export function footnoteMatchesMetric(populationType: string, metric: string): boolean {
  const list = FOOTNOTE_TYPES[metric];
  if (!list || list.length === 0) return true;
  return list.includes(populationType.trim().toUpperCase());
}
