/**
 * ETL configuration — every endpoint, threshold, and magic number lives here (spec §7.1, risk #5).
 * Runs under Node ≥ 22.12 with native type stripping: no enums, no namespaces, explicit .ts imports.
 */

export const UNHCR_BASE = 'https://api.unhcr.org/population/v1';

export const HTTP = {
  concurrency: 2,
  minIntervalMs: 300,
  timeoutMs: 60_000, // measured: a 10,000-row page takes ~7.5 s
  retries: 5, // exponential backoff 1→2→4→8→16 s + jitter
  retryOn: [429, 500, 502, 503, 504],
  userAgent: 'WhereTheyWent/1.0 (+https://wheretheywent.lakkev.com; roccafcheng@gmail.com)',
} as const;

export const PAGE_LIMIT = 10_000; // measured OK (no 100 cap)

export const YEARS = {
  min: 1951,
  /** Year-range split for stock files: first file = first-screen, second = idle prefetch. */
  recentWindow: 11, // 2015–2025 when max=2025
  demographicsFrom: 2010,
  idmcFrom: 2009,
  solutionsFrom: 2000,
  asylumAppsFrom: 2015,
  flowsFrom: 2015, // Phase 2 data, fetched now (spec batch ④/Phase 2)
} as const;

export const WPP = {
  url: 'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_TotalPopulationBySex.csv.gz',
  variant: 'Medium', // only the Medium variant rows for projections; estimates rows for ≤2023
  /** Fallback: World Bank (UTF-8 BOM, no Taiwan). */
  worldBankUrl:
    'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=500&mrnev=1',
  worldBankCountriesUrl: 'https://api.worldbank.org/v2/country?format=json&per_page=400',
} as const;

export const IDMC = {
  iduUrl:
    'https://helix-tools-api.idmcdb.org/external-api/idus/last-180-days/?client_id=IDMCWSHSOLO009',
  /** Keep at most this many events in the published file (newest first). */
  iduMaxEvents: 3000,
} as const;

export const GEO = {
  /** world-atlas file: 50m (110m distorts Lebanon/Jordan etc.). */
  input: 'node_modules/world-atlas/countries-50m.json',
  /**
   * mapshaper pipeline (§11.1). The spec estimated 4%; measured on 2026-08-19 that leaves Lebanon
   * with 5 vertices (72 KB raw / 20 KB br). 20% keeps small host countries recognisable at
   * 163 KB raw / 42 KB br — still under the 280 KB gate and the 80 KB br first-screen budget.
   */
  simplify: 'visvalingam weighted 20% keep-shapes',
  filterIslands: 'min-area 5km2',
  quantization: 1e4,
  /** Gates */
  maxTopoBytes: 280 * 1024,
  minFeatures: 170,
  maxFeatures: 260,
} as const;

export const THRESHOLDS = {
  /** Unmatched code with any metric above this → source FAIL (§7.7). */
  unmatchedFailAbove: 10_000,
  /** Global yearly totals may not change by more than this fraction vs previous snapshot (§13.2 #4). */
  maxTotalDrift: 0.2,
  /** Golden numbers tolerance (§13.2 #13). */
  goldenTolerance: 0.01,
  maxFileBytes: 20 * 1024 * 1024,
  maxFiles: 5_000,
  countriesExpected: 232,
  countriesTolerance: 5,
  /** Consecutive failed days before the workflow is marked failed (§7.8). */
  staleDaysBeforeAlert: 3,
} as const;

/**
 * Golden numbers — publicly verifiable anchors (UNHCR Global Trends / Refugee Data Finder).
 * Each entry: which query, which metric, expected value, and where it was verified.
 * Update ONLY when UNHCR revises the figure (note the date + URL in docs/data-verification.md).
 */
export const GOLDEN: {
  id: string;
  view: 'asylum' | 'origin';
  iso3: string | 'WORLD';
  year: number;
  metric: 'refugees' | 'idps' | 'asylum_seekers';
  expected: number;
  note: string;
}[] = [
  // Values verified against the API on 2026-08-19 and cross-referenced with UNHCR Global Trends.
  // See docs/data-verification.md.
  {
    id: 'tur-refugees-2024',
    view: 'asylum',
    iso3: 'TUR',
    year: 2024,
    metric: 'refugees',
    expected: 2_940_735,
    note: 'Türkiye refugees end-2024 = 2,940,735 (API 2026-08-19; Global Trends 2024 rounds to 2.9M).',
  },
  {
    id: 'syr-idps-2016',
    view: 'origin',
    iso3: 'SYR',
    year: 2016,
    metric: 'idps',
    expected: 6_325_978,
    note: 'Syria IDPs end-2016 (UNHCR Global Trends 2016: 6.3M).',
  },
  {
    id: 'world-refugees-2024',
    view: 'asylum',
    iso3: 'WORLD',
    year: 2024,
    metric: 'refugees',
    expected: 30_958_200,
    note: 'Refugees under UNHCR mandate end-2024 = 30,958,200 (sum of coa_all rows, API 2026-08-19; Global Trends 2024 rounds to 31.0M, excl. UNRWA).',
  },
];

/** Golden tolerances per entry may be widened while anchors are being verified; default from THRESHOLDS. */
export const GOLDEN_TOLERANCE_OVERRIDE: Record<string, number> = {};

export const SOURCE_IDS = [
  'unhcr_countries',
  'unhcr_population',
  'unhcr_demographics',
  'unhcr_idmc',
  'unhcr_solutions',
  'unhcr_asylum_applications',
  'unhcr_footnotes',
  'unhcr_nowcasting',
  'wpp_population',
  'idmc_idu',
  'natural_earth',
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const PATHS = {
  publicData: 'public/data/v1',
  staging: '.etl-staging',
  raw: '.etl-raw',
  geoOverrides: 'scripts/etl/geo/overrides.json',
  disputedNotes: 'scripts/etl/geo/disputed-notes.json',
  displayOverrides: 'scripts/etl/lib/display-overrides.json',
} as const;
