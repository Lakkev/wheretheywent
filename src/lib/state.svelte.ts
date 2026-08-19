/**
 * Single shared reactive state for the map application (Svelte 5 runes, zero state libs).
 * Big immutable payloads live in $state.raw + a version counter; UI state is a deep $state.
 */
import type { Locale } from '../i18n/ui';
import { DataClient, StockStore, indexCountries, type DataClient as DC } from './data';
import type {
  CountriesFile,
  CountryMeta,
  Manifest,
  MetricsFile,
  SourcesFile,
  NowcastFile,
  IduFile,
} from './types';
import { defaultState, type MapState, MAX_COMPARE } from './url';
import type { Topology } from 'topojson-specification';

export const ui: MapState = $state(defaultState({ yearMin: 1951, yearMax: 2025 }));

export const data = $state({
  manifest: null as Manifest | null,
  countriesFile: null as CountriesFile | null,
  sources: null as SourcesFile | null,
  metrics: null as MetricsFile | null,
  nowcast: null as NowcastFile | null,
  idu: null as IduFile | null,
  yearMin: 1951,
  yearMax: 2025,
  /** bumps whenever stock windows change (the StockStore itself is not reactive) */
  stockVersion: 0,
  coreLoaded: false,
  historyLoaded: false,
  geoLoaded: false,
  error: null as string | null,
});

/** Non-reactive heavy objects. */
export const raw = {
  client: new DataClient() as DC,
  stock: new StockStore(),
  countryIndex: new Map<string, CountryMeta>(),
  geo: null as Topology | null,
  knownIso: new Set<string>(),
  knownRegions: new Set<string>(),
};

export const session = $state({
  locale: 'en' as Locale,
  hover: null as string | null,
  playing: false,
  presentation: false,
  webgl2: true,
  basemapOk: true,
  mapReady: false,
  /** live-region text for screen readers */
  announce: '',
  toasts: [] as { id: number; text: string }[],
  dialog: null as null | 'share' | 'cite' | 'download' | 'keys' | 'boundaries' | 'stale',
  detailCountry: null as import('./types').CountryFile | null,
  detailLoading: false,
  /** when true, state changes came from URL (popstate) — do not push history */
  applyingFromUrl: false,
});

let toastId = 0;
export function toast(text: string, ms = 4000) {
  const id = ++toastId;
  session.toasts.push({ id, text });
  setTimeout(() => {
    const i = session.toasts.findIndex((t) => t.id === id);
    if (i >= 0) session.toasts.splice(i, 1);
  }, ms);
}

export function announce(text: string) {
  session.announce = '';
  // force re-announce even when identical
  queueMicrotask(() => (session.announce = text));
}

export function selectCountry(iso3: string | null) {
  ui.c = iso3;
}

export function toggleCompare(iso3: string) {
  const i = ui.cmp.indexOf(iso3);
  if (i >= 0) ui.cmp.splice(i, 1);
  else if (ui.cmp.length < MAX_COMPARE) ui.cmp = [...ui.cmp, iso3].sort();
  else toast(`Up to ${MAX_COMPARE} countries can be compared.`);
}

export function setYear(y: number) {
  ui.y = Math.min(Math.max(y, data.yearMin), data.yearMax);
}

export function applyState(next: MapState) {
  for (const k of Object.keys(next) as (keyof MapState)[]) {
    // @ts-expect-error — generic assignment over a union of keys
    ui[k] = next[k];
  }
}

export function snapshot(): MapState {
  return { ...ui, cmp: [...ui.cmp], r: [...ui.r], map: ui.map ? { ...ui.map } : null };
}

/** Load manifest + first-screen payloads. Idempotent. */
export async function loadCore(): Promise<void> {
  if (data.coreLoaded) return;
  const c = raw.client;
  const manifest = await c.loadManifest();
  data.manifest = manifest;
  data.yearMin = manifest.year_min;
  data.yearMax = manifest.year_max;
  const first = manifest.stock_files[0];
  const [countries, stock, sources, metrics] = await Promise.all([
    c.countries(),
    first ? c.stock(first) : Promise.resolve(null),
    c.sources(),
    c.metrics(),
  ]);
  data.countriesFile = countries;
  raw.countryIndex = indexCountries(countries);
  raw.knownIso = new Set(countries.countries.map((x) => x.iso3));
  raw.knownRegions = new Set(countries.regions.map((r) => r.slug));
  if (stock && first) raw.stock.add(stock, first);
  data.sources = sources;
  data.metrics = metrics;
  data.stockVersion++;
  data.coreLoaded = true;
}

export async function loadGeo(): Promise<Topology | null> {
  if (raw.geo) return raw.geo;
  raw.geo = await raw.client.geo();
  data.geoLoaded = true;
  return raw.geo;
}

export async function loadHistory(): Promise<void> {
  if (data.historyLoaded || !data.manifest) return;
  const rest = data.manifest.stock_files.slice(1);
  await Promise.all(
    rest.map(async (f) => {
      const s = await raw.client.stock(f);
      raw.stock.add(s, f);
    }),
  );
  data.stockVersion++;
  data.historyLoaded = true;
}

export async function loadLive(): Promise<void> {
  const [n, i] = await Promise.allSettled([raw.client.nowcast(), raw.client.idu()]);
  if (n.status === 'fulfilled') data.nowcast = n.value;
  if (i.status === 'fulfilled') data.idu = i.value;
}

export async function loadDetail(iso3: string | null) {
  if (!iso3) {
    session.detailCountry = null;
    return;
  }
  const cached = raw.client.peekCountry(iso3);
  if (cached) {
    session.detailCountry = cached;
    return;
  }
  session.detailLoading = true;
  try {
    const f = await raw.client.country(iso3);
    if (ui.c === iso3) session.detailCountry = f;
  } catch (e) {
    toast('Could not load country details.');
  } finally {
    session.detailLoading = false;
  }
}

export function prefetchCountry(iso3: string) {
  if (!raw.client.hasCountry(iso3)) void raw.client.country(iso3).catch(() => {});
}

export const staleSources = () =>
  Object.entries(data.sources ?? {}).filter(([, s]) => s.status !== 'ok');
