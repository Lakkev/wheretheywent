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

/**
 * Components of `total_poc` — UNHCR's "people of concern", which is a protection-mandate
 * category, not a displacement one. Excludes host community and returnees.
 */
export const TOTAL_POC_COMPONENTS = [
  'refugees',
  'asylum_seekers',
  'idps',
  'stateless',
  'ooc',
  'oip',
] as const satisfies readonly MetricId[];

/**
 * Components of forced displacement — people who left, or were driven from, where they lived.
 *
 * This is deliberately NARROWER than `total_poc`. Stateless persons are counted by country of
 * residence and are not necessarily displaced; "others of concern" is a residual protection
 * category with no displacement definition at all. Together they are roughly 6% of `total_poc`,
 * so any sentence that says "forcibly displaced" must be computed from this list and never
 * from `total_poc`. Matches the population groups UNHCR itself reports as forcibly displaced.
 */
export const FORCED_DISPLACEMENT_COMPONENTS = [
  'refugees',
  'asylum_seekers',
  'idps',
  'oip',
] as const satisfies readonly MetricId[];

/** Derived metric for UI: refugees + asylum_seekers + idps + stateless + ooc + oip. */
export type DerivedMetricId = 'total_poc';
export type AnyMetricId = MetricId | DerivedMetricId;

export type ViewId = 'asylum' | 'origin';
export type SourceStatus = 'ok' | 'stale' | 'unstable';

/** Packed series: ints, null = not reported ("-"), ["z", n] = run of n zeros, ["n", n] = run of n nulls. */
export type PackedCell = number | null | ['z' | 'n', number];
export type PackedSeries = PackedCell[];

export interface Manifest {
  schema: 1;
  /** Content-addressed snapshot id: first 8 hex of sha256 over all file hashes (stable across re-runs). */
  snapshot_id: string;
  /** Git commit that produced/contains this data, when known (set by CI), else null. */
  git_commit: string | null;
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
  caveats: string[];
  caveats_zh?: string[];
  /** Full per-locale caveat translations (data-level strings are never tiered to English). */
  caveats_i18n?: Record<string, string[]>;
  /** Endpoint(s) or URL(s) actually fetched. */
  endpoints?: string[];
}
export type SourcesFile = Record<string, SourceEntry>;

export interface MetricDef {
  id: AnyMetricId;
  label: string;
  definition: string;
  /** zh-Hant rendering of definition/caveats (labels come from i18n metric.* keys). */
  definition_zh?: string;
  /** Full per-locale definition/caveat translations — the academic core is never tiered. */
  definition_i18n?: Record<string, string>;
  caveats_i18n?: Record<string, string[]>;
  unit: 'persons';
  source_id: string;
  views: ViewId[];
  caveats: string[];
  caveats_zh?: string[];
  /** #8: first year this series was collected at all (e.g. OIP 2018) — earlier years are structurally absent, not "not reported". */
  coverage_from?: number;
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

export interface AsylumAppRow {
  year: number;
  applied: number | null;
}

export interface IdmcRow {
  year: number;
  total: number | null; // total displacement (stock)
}

export interface Footnote {
  /** null = applies to all years */
  year: number | null;
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
  /** Solutions for people FROM this country (origin perspective). */
  solutions: SolutionsRow[];
  /** Solutions happening IN this country (host perspective: naturalisation, resettlement arrivals…). */
  solutions_host: SolutionsRow[];
  /** Asylum applications (persons) lodged in this country / by nationals of this country, 2015+. */
  asylum_applications: { host: AsylumAppRow[]; origin: AsylumAppRow[] };
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

/** flows/{year}.json — bilateral matrix, 2015+: [origin, asylum, refugees, asylum_seekers]. */
export interface FlowsFile {
  year: number;
  rows: [string, string, number | null, number | null][];
}

/** Insight engine: mechanically computed, verifiable facts — every one deep-links to a
 *  reproducible view. Numbers only; wording comes from i18n templates. */
export interface InsightsFile {
  schema: 1;
  year: number;
  global: {
    total_poc: number | null;
    /**
     * refugees + asylum-seekers + IDPs + OIP. Narrower than `total_poc`: excludes stateless
     * persons and others of concern, neither of whom is necessarily displaced.
     */
    forced_displacement: number | null;
    refugees: number | null;
    idps: number | null;
    /** world population ÷ `forced_displacement` — the denominator of "1 in N is displaced" */
    one_in_n: number | null;
    top_hosts: { iso3: string; value: number }[];
    top_origins: { iso3: string; value: number }[];
    /** share (0–1) of all refugees hosted by the top-5 host countries */
    top5_host_share: number | null;
    /** largest single-year increase in refugees hosted, ever recorded */
    record_host_jump: { iso3: string; year: number; delta: number } | null;
    record_origin_jump: { iso3: string; year: number; delta: number } | null;
  };
  /** The record library (/insights): all-time extremes, each row deep-linkable. */
  records: {
    host_jumps: { iso3: string; year: number; delta: number }[];
    origin_jumps: { iso3: string; year: number; delta: number }[];
    /** most negative one-year changes — may reflect returns, naturalisation or revisions */
    host_drops: { iso3: string; year: number; delta: number }[];
    per1k_peaks: { iso3: string; year: number; rate: number }[];
    /** countries with the most years spent as the world's #1 origin */
    top_origin_years: { iso3: string; years: number }[];
  };
  countries: Record<
    string,
    {
      host_rank: number | null;
      origin_rank: number | null;
      per1k: number | null;
      per1k_rank: number | null;
      peak_host: { year: number; value: number } | null;
      /** refugees hosted now ÷ ten years ago (both > 0) */
      decade_host_ratio: number | null;
      /** largest origin of refugees hosted here (latest flows) */
      top_partner: { iso3: string; value: number } | null;
      /** largest destination of refugees from here (latest flows) */
      top_dest: { iso3: string; value: number } | null;
      share_of_world_origin: number | null;
    }
  >;
}

/** #14: global totals per year/metric/view — powers "share of world" lines. */
export interface WorldTotalsFile {
  schema: 1;
  /** year → metric id (incl. derived total_poc) → global totals; null = nothing reported */
  totals: Record<string, Record<string, { asylum: number | null; origin: number | null }>>;
}

export interface Datapackage {
  name: string;
  title: string;
  licenses: { name: string; path: string; title: string }[];
  resources: unknown[];
  [k: string]: unknown;
}
