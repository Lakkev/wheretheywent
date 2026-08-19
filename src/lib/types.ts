/**
 * Shared data contracts for files under public/data/v1.
 * Produced by scripts/etl (which imports these types) and consumed by src/.
 * Keep this file framework-free and dependency-free.
 */

/** Population-type metrics as reported by UNHCR /population/ (+ idps from /idmc/). */
export const METRIC_IDS = [
  'refugees',
  'asylum_seekers',
  'idps',
  'stateless',
  'ooc',
  'returned_refugees',
  'returned_idps',
  'oip',
  'hst',
] as const;
export type MetricId = (typeof METRIC_IDS)[number];

/** Derived metric for UI: refugees + asylum_seekers + idps + stateless + ooc + oip (+ hst). */
export type DerivedMetricId = 'total_poc';
export type AnyMetricId = MetricId | DerivedMetricId;

export type ViewId = 'asylum' | 'origin';
export type SourceStatus = 'ok' | 'stale' | 'unstable';

/** Packed series: ints, null = not reported ("-"), ["z", n] = run of n zeros. */
export type PackedCell = number | null | ['z', number];
export type PackedSeries = PackedCell[];

export interface Manifest {
  schema: 1;
  snapshot_id: string; // git short hash or "local"
  generated_at: string; // ISO timestamp of the ETL run that last changed any file
  year_min: number;
  year_max: number;
  /** Stock files in load order: first = first-screen, rest = idle prefetch. */
  stock_files: string[];
  files: Record<string, { sha256: string; bytes: number }>;
}

export interface SourceEntry {
  publisher: string;
  title: string;
  landing_page: string;
  license: { id: string; url: string };
  attribution: string;
  data_as_of: string; // YYYY-MM-DD
  period_type: 'year-end' | 'mid-year' | 'monthly' | 'rolling' | 'annual';
  retrieved_at: string; // ISO; only updated when content hash changes
  coverage: { year_min: number; year_max: number };
  content_hash: string; // "sha256:…"
  status: SourceStatus;
  stale_since?: string;
  last_error?: string;
  last_success?: string;
  caveats: string[];
  caveats_zh?: string[];
  /** Endpoint(s) or URL(s) actually fetched. */
  endpoints?: string[];
}
export type SourcesFile = Record<string, SourceEntry>;

export interface MetricDef {
  id: AnyMetricId;
  label: string;
  definition: string;
  unit: 'persons';
  source_id: string;
  views: ViewId[];
  caveats: string[];
  derived?: boolean;
  components?: MetricId[];
}
export interface MetricsFile {
  schema: 1;
  metrics: Record<AnyMetricId, MetricDef>;
}

export interface CountryMeta {
  iso3: string;
  iso2: string | null;
  /** Name as used by the data source (UNHCR), for citation fidelity. */
  name: string;
  /** Name shown in UI (override table applied, e.g. "Serbia", "Taiwan"). */
  display_name: string;
  display_name_zh?: string;
  /** UNHCR internal code — for debugging/audit only. Never used as join key. */
  unhcr_code: string | null;
  region: string; // UNHCR region name or "Other"
  region_slug: string;
  centroid: [number, number] | null;
  bbox: [number, number, number, number] | null;
  in_unhcr: boolean;
  in_geo: boolean;
  in_wpp: boolean;
  /** Free-text caveat shown in tooltip/detail (e.g. Taiwan, Kosovo). */
  note?: string;
  note_zh?: string;
}
export interface CountriesFile {
  schema: 1;
  count: number;
  regions: { slug: string; name: string }[];
  countries: CountryMeta[];
}

export interface StockFile {
  schema: 1;
  snapshot: string;
  years: number[];
  metrics: MetricId[];
  asylum: Record<string, { v: PackedSeries[] }>;
  origin: Record<string, { v: PackedSeries[] }>;
  /** WPP total population (persons), aligned with `years`; null if not covered. */
  population: Record<string, PackedSeries>;
  /** Global totals per metric aligned with years (sum over asylum view). */
  totals: { asylum: PackedSeries[]; origin: PackedSeries[] };
  /** ISO3s that have data but are not drawable (no geometry) — per metric per year count. */
  unmappable: string[];
  sources: string[];
}

export interface DemographicsRow {
  year: number;
  // female/male by age groups 0-4, 5-11, 12-17, 18-59, 60+, other; then totals
  f: (number | null)[]; // [f_0_4, f_5_11, f_12_17, f_18_59, f_60, f_other, f_total]
  m: (number | null)[]; // [m_0_4, m_5_11, m_12_17, m_18_59, m_60, m_other, m_total]
  total: number | null;
}

export interface FlowRow {
  /** partner ISO3 */
  p: string;
  refugees: number | null;
  asylum_seekers: number | null;
}

export interface SolutionsRow {
  year: number;
  returned_refugees: number | null;
  resettlement: number | null;
  naturalisation: number | null;
  returned_idps: number | null;
}

export interface IdmcRow {
  year: number;
  total: number | null; // total displacement (stock)
}

export interface Footnote {
  year: number;
  population_type: string;
  text: string;
  view: ViewId;
}

export interface CountryFile {
  schema: 1;
  snapshot: string;
  iso3: string;
  meta: CountryMeta;
  years: number[]; // full range year_min..year_max
  metrics: MetricId[];
  asylum: { v: PackedSeries[] };
  origin: { v: PackedSeries[] };
  population: PackedSeries;
  demographics: DemographicsRow[]; // coa dimension, 2010+
  /** Top partner countries by year (keyed by year as string). */
  top_origins: Record<string, FlowRow[]>; // people hosted here, by origin
  top_hosts: Record<string, FlowRow[]>; // people from here, by host
  solutions: SolutionsRow[];
  idmc: IdmcRow[];
  footnotes: Footnote[];
  sources: string[];
}

export interface DisputedNote {
  id: string;
  iso3: string | null;
  name: string;
  name_zh: string;
  how_shown: string;
  how_shown_zh: string;
  source_naming: string;
  source_naming_zh: string;
}
export interface DisputedNotes {
  schema: 1;
  disclaimer_en: string;
  disclaimer_zh: string;
  notes: DisputedNote[];
}

export interface NowcastRow {
  iso3: string;
  refugees: number | null;
  asylum_seekers: number | null;
  source: string;
}
export interface NowcastFile {
  schema: 1;
  snapshot: string;
  period: string; // e.g. "2026-06"
  rows: NowcastRow[];
  total_refugees: number | null;
  total_asylum_seekers: number | null;
  source_id: string;
}

export interface IduEvent {
  id: number;
  iso3: string;
  country: string;
  lat: number | null;
  lon: number | null;
  figure: number | null;
  type: string; // Conflict / Disaster / Other
  displacement_date: string; // YYYY-MM-DD
  created_at: string;
  text: string; // sanitized plain text
  url: string | null;
}
export interface IduFile {
  schema: 1;
  snapshot: string;
  since: string;
  until: string;
  count: number;
  by_country: Record<string, { events: number; figure: number }>;
  events: IduEvent[];
  source_id: string;
}

export interface Datapackage {
  name: string;
  title: string;
  licenses: { name: string; path: string; title: string }[];
  resources: unknown[];
  [k: string]: unknown;
}
