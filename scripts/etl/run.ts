/**
 * ETL orchestrator → writes a complete candidate dataset to the staging dir (§4, §7.8).
 *
 *   node scripts/etl/run.ts --out .etl-staging [--skip-live] [--skip-wpp]
 *
 * Failure model (promote granularity = source, §7.8): each source is fetched independently.
 *   - core (countries + population) failing → stock/country/downloads are NOT produced; live files still are.
 *   - a secondary source failing → its component is carried over from the previous country files
 *     (public/data/v1) and the source is marked "stale".
 *   - live sources failing → file not produced (promote keeps the previous one), source marked stale.
 * Nothing here touches public/data/v1 — promote.ts does, after validate.ts passes.
 */
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { PATHS, SOURCE_IDS, THRESHOLDS, YEARS, type SourceId } from './config.ts';
import { log } from './lib/log.ts';
import {
  rmrf,
  writeJsonAtomic,
  readJsonIfExists,
  sha256,
  writeFileAtomic,
  listFiles,
  sha256File,
} from './lib/atomic.ts';
import { buildGeo, type GeoIndex } from './geo/build-geo.ts';
import { fetchUnhcrCountries, type UnhcrCountry } from './sources/unhcr-countries.ts';
import { detectMaxYear } from './sources/unhcr-years.ts';
import {
  fetchPopulation,
  type UnmatchedEntry,
} from './sources/unhcr-population.ts';
import {
  fetchDemographics,
  fetchIdmc,
  fetchSolutions,
  fetchAsylumApplications,
  fetchFootnotes,
  fetchNowcasting,
} from './sources/unhcr-secondary.ts';
import { fetchWpp, fetchWorldBankFallback, type WppResult } from './sources/wpp-population.ts';
import { fetchIdu } from './sources/idmc-idu.ts';
import { buildRegistry } from './lib/registry.ts';
import { buildMetrics } from './lib/metrics.ts';
import { buildSourceEntry, markStale } from './lib/provenance.ts';
import {
  buildStock,
  buildWorldTotals,
  buildInsights,
  buildCountryFiles,
  buildFlows,
  writeDownloads,
  buildDatapackage,
  writeCountryFiles,
  writeUnmatched,
  type TransformInput,
} from './lib/transform.ts';
import { CodeRegistry, NON_GEO_ENTITIES } from './lib/codes.ts';
import { unpack } from '../../src/lib/columnar.ts';
import {
  METRIC_IDS,
  type SourcesFile,
  type SourceEntry,
  type CountriesFile,
  type CountryFile,
  type Manifest,
  type StockFile,
  type NowcastFile,
  type IduFile,
  type DemographicsRow,
  type IdmcRow,
  type SolutionsRow,
  type Footnote,
  type AsylumAppRow,
} from '../../src/lib/types.ts';

// ---------- CLI ----------
const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const OUT = arg('--out') ?? PATHS.staging;
const SKIP_LIVE = argv.includes('--skip-live');
const SKIP_WPP = argv.includes('--skip-wpp');
const PREV = PATHS.publicData;

// ---------- status tracking ----------
type Status = { id: SourceId; status: 'ok' | 'stale' | 'skipped'; error?: string; rows?: number };
const statuses: Status[] = [];
const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const prevSources = readJsonIfExists<SourcesFile>(join(PREV, 'sources.json')) ?? {};
const prevManifest = readJsonIfExists<Manifest>(join(PREV, 'manifest.json'));
const sources: SourcesFile = {};

function ok(id: SourceId, entry: SourceEntry, rows?: number) {
  sources[id] = entry;
  statuses.push({ id, status: 'ok', rows });
}
function stale(id: SourceId, err: unknown, status: 'stale' | 'unstable' = 'stale') {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  log.error(`${id} FAILED → ${status}: ${msg}`);
  sources[id] = markStale(prevSources[id] ?? null, id, msg, now, status);
  statuses.push({ id, status: 'stale', error: msg });
}
/** Test hook: ETL_FAIL="unhcr_demographics,idmc_idu" forces those sources to fail (for resilience checks). */
const FORCED_FAIL = new Set(
  (process.env.ETL_FAIL ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
async function attempt<T>(id: SourceId, fn: () => Promise<T>): Promise<T | null> {
  try {
    if (FORCED_FAIL.has(id)) throw new Error(`forced failure via ETL_FAIL`);
    return await fn();
  } catch (e) {
    // Upstream publishing mid-run is a distinct condition (§7.2): expected to clear tomorrow.
    const unstable = e instanceof Error && e.name === 'UnstableSourceError';
    stale(id, e, unstable ? 'unstable' : 'stale');
    return null;
  }
}

/**
 * §7.7 step 4 for non-core sources: any unmatched code above the threshold fails the whole source
 * (no silent data loss). Small unmatched entries are kept for the merged unmatched-report.
 */
function guardUnmatched<T extends { unmatched: UnmatchedEntry[] }>(
  id: SourceId,
  res: T | null,
): T | null {
  if (!res) return null;
  const big = res.unmatched.filter((u) => u.max_value > THRESHOLDS.unmatchedFailAbove);
  if (big.length) {
    stale(
      id,
      new Error(
        `unmatched codes with >${THRESHOLDS.unmatchedFailAbove} persons: ${big
          .map((b) => `${b.raw}(${b.max_value})`)
          .join(', ')}`,
      ),
    );
    return null;
  }
  return res;
}

/** Previous country files, loaded lazily for component fallback. */
let prevCountryCache: Map<string, CountryFile> | null = null;
function prevCountries(): Map<string, CountryFile> {
  if (prevCountryCache) return prevCountryCache;
  prevCountryCache = new Map();
  const dir = join(PREV, 'country');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const c = readJsonIfExists<CountryFile>(join(dir, f));
      if (c) prevCountryCache.set(c.iso3, c);
    }
  }
  return prevCountryCache;
}
function fallbackComponent<T>(pick: (c: CountryFile) => T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const [k, c] of prevCountries()) {
    const v = pick(c);
    if (v && v.length) out.set(k, v);
  }
  if (out.size) log.warn(`  ↳ carried over from previous snapshot (${out.size} countries)`);
  return out;
}

async function main() {
  log.group(`ETL run ${now} → ${OUT}`);
  rmrf(OUT);

  // ---------- geo (local, deterministic) ----------
  log.group('geo');
  const geoRes = await attempt('natural_earth', buildGeo);
  let geoIndex: GeoIndex;
  if (geoRes) {
    writeFileAtomic(join(OUT, 'geo', 'world-50m.topo.json'), geoRes.topoText);
    writeJsonAtomic(join(OUT, 'geo', 'geo-index.json'), geoRes.index);
    const notes = readFileSync(PATHS.disputedNotes, 'utf8');
    writeFileAtomic(
      join(OUT, 'geo', 'disputed-notes.json'),
      notes.endsWith('\n') ? notes : notes + '\n',
    );
    geoIndex = geoRes.index;
    ok(
      'natural_earth',
      buildSourceEntry({
        id: 'natural_earth',
        data_as_of: '2022-05-01',
        coverage: { year_min: 0, year_max: 0 },
        content_hash: sha256(geoRes.topoText),
        previous: prevSources['natural_earth'],
        now,
        endpoints: ['node_modules/world-atlas/countries-50m.json'],
      }),
    );
  } else {
    const prevIdx = readJsonIfExists<GeoIndex>(join(PREV, 'geo', 'geo-index.json'));
    if (!prevIdx) throw new Error('geo failed and no previous geo-index.json — cannot continue');
    geoIndex = prevIdx;
  }

  // ---------- countries ----------
  log.group('countries');
  const cRes = await attempt('unhcr_countries', fetchUnhcrCountries);
  let unhcrCountries: UnhcrCountry[];
  const prevCountriesFile = readJsonIfExists<CountriesFile>(join(PREV, 'countries.json'));
  if (cRes) {
    unhcrCountries = cRes.countries;
    const cEntry = buildSourceEntry({
      id: 'unhcr_countries',
      data_as_of: '',
      coverage: { year_min: 0, year_max: 0 },
      content_hash: cRes.hash,
      previous: prevSources['unhcr_countries'],
      now,
      endpoints: [cRes.url],
    });
    cEntry.data_as_of = cEntry.retrieved_at.slice(0, 10); // list has no intrinsic date; stable unless content changes
    ok('unhcr_countries', cEntry, cRes.countries.length);
  } else if (prevCountriesFile) {
    log.warn('countries: using previous countries.json as registry');
    unhcrCountries = prevCountriesFile.countries
      .filter((c) => c.in_unhcr)
      .map((c) => ({
        key: c.iso3,
        unhcr_code: c.unhcr_code ?? '',
        unhcr_id: 0,
        iso2: c.iso2,
        name: c.name,
        majorArea: c.region,
        subregion: null,
      }));
  } else {
    throw new Error('countries failed and no previous countries.json — cannot continue');
  }

  // ---------- years ----------
  log.group('years');
  let maxYear: number;
  try {
    maxYear = (await detectMaxYear()).maxYear;
  } catch (e) {
    if (!prevManifest) throw e;
    maxYear = prevManifest.year_max;
    log.warn(`years: detection failed (${String(e)}), using previous max ${maxYear}`);
  }
  const yearMin = YEARS.min;
  const allYears: number[] = [];
  for (let y = yearMin; y <= maxYear; y++) allYears.push(y);

  // ---------- WPP ----------
  log.group('wpp');
  let wpp: WppResult | null = null;
  if (!SKIP_WPP) {
    wpp = await attempt('wpp_population', () => fetchWpp(maxYear));
    if (!wpp) {
      try {
        wpp = await fetchWorldBankFallback();
      } catch (e) {
        log.error(`world bank fallback failed too: ${String(e)}`);
      }
    }
  }
  let population: Map<string, Map<number, number>> | null = wpp?.byKey ?? null;
  if (!population) {
    // carry over from previous stock files
    const prevPop = new Map<string, Map<number, number>>();
    for (const f of prevManifest?.stock_files ?? []) {
      const s = readJsonIfExists<StockFile>(join(PREV, f));
      if (!s) continue;
      for (const [k, packed] of Object.entries(s.population)) {
        const vals = unpack(packed);
        const m = prevPop.get(k) ?? new Map<number, number>();
        vals.forEach((v, i) => {
          if (v !== null) m.set(s.years[i]!, v);
        });
        prevPop.set(k, m);
      }
    }
    if (prevPop.size) {
      population = prevPop;
      log.warn(`wpp: carried over population for ${prevPop.size} countries from previous snapshot`);
    }
  } else if (wpp) {
    ok(
      'wpp_population',
      buildSourceEntry({
        id: 'wpp_population',
        data_as_of: `${wpp.baseYear}-07-01`,
        coverage: { year_min: 1950, year_max: maxYear },
        content_hash: wpp.hash,
        previous: prevSources['wpp_population'],
        now,
        endpoints: [wpp.url],
      }),
      wpp.byKey.size,
    );
    if (wpp.provider === 'worldbank')
      sources['wpp_population']!.caveats = [
        ...sources['wpp_population']!.caveats,
        'FALLBACK: World Bank SP.POP.TOTL was used because UN WPP was unreachable.',
      ];
  }

  // ---------- registry ----------
  const wppKeys = new Set<string>(population ? [...population.keys()] : []);
  const { file: countriesFile, codes } = buildRegistry({
    unhcr: unhcrCountries,
    geo: geoIndex,
    wppKeys,
    wppNames: wpp?.names ?? new Map(),
  });
  writeJsonAtomic(join(OUT, 'countries.json'), countriesFile);
  log.info(`registry: ${countriesFile.count} entities, ${countriesFile.regions.length} regions`);

  // ---------- population (core) ----------
  log.group('population');
  const pop = await attempt('unhcr_population', () => fetchPopulation(maxYear, codes));
  let coreOk = false;
  let stockFiles: string[] = [];
  const metricsFile = buildMetrics();
  writeJsonAtomic(join(OUT, 'metrics.json'), metricsFile, true);

  // secondary sources (run regardless, they feed country files)
  log.group('secondary');
  const [demoRaw, idmcRaw, solRaw, appsRaw, fn] = await Promise.all([
    attempt('unhcr_demographics', () => fetchDemographics(maxYear, codes)),
    attempt('unhcr_idmc', () => fetchIdmc(maxYear, codes)),
    attempt('unhcr_solutions', () => fetchSolutions(maxYear, codes)),
    attempt('unhcr_asylum_applications', () => fetchAsylumApplications(maxYear, codes)),
    attempt('unhcr_footnotes', () => fetchFootnotes(maxYear, codes)),
  ]);
  const demo = guardUnmatched('unhcr_demographics', demoRaw);
  const idmc = guardUnmatched('unhcr_idmc', idmcRaw);
  const sol = guardUnmatched('unhcr_solutions', solRaw);
  const apps = guardUnmatched('unhcr_asylum_applications', appsRaw);
  const asOf = `${maxYear}-12-31`;
  const cov = { year_min: yearMin, year_max: maxYear };
  if (demo)
    ok(
      'unhcr_demographics',
      buildSourceEntry({
        id: 'unhcr_demographics',
        data_as_of: asOf,
        coverage: { year_min: YEARS.demographicsFrom, year_max: maxYear },
        content_hash: sha256(demo.hash),
        previous: prevSources['unhcr_demographics'],
        now,
        endpoints: demo.urls,
      }),
      demo.rows,
    );
  if (idmc)
    ok(
      'unhcr_idmc',
      buildSourceEntry({
        id: 'unhcr_idmc',
        data_as_of: asOf,
        coverage: { year_min: YEARS.idmcFrom, year_max: maxYear },
        content_hash: sha256(idmc.hash),
        previous: prevSources['unhcr_idmc'],
        now,
        endpoints: idmc.urls,
      }),
      idmc.rows,
    );
  if (sol)
    ok(
      'unhcr_solutions',
      buildSourceEntry({
        id: 'unhcr_solutions',
        data_as_of: asOf,
        coverage: { year_min: YEARS.solutionsFrom, year_max: maxYear },
        content_hash: sha256(sol.hash),
        previous: prevSources['unhcr_solutions'],
        now,
        endpoints: sol.urls,
      }),
      sol.rows,
    );
  if (apps)
    ok(
      'unhcr_asylum_applications',
      buildSourceEntry({
        id: 'unhcr_asylum_applications',
        data_as_of: asOf,
        coverage: { year_min: YEARS.asylumAppsFrom, year_max: maxYear },
        content_hash: sha256(apps.hash),
        previous: prevSources['unhcr_asylum_applications'],
        now,
        endpoints: apps.urls,
      }),
      apps.rows,
    );
  if (fn)
    ok(
      'unhcr_footnotes',
      buildSourceEntry({
        id: 'unhcr_footnotes',
        data_as_of: asOf,
        coverage: cov,
        content_hash: sha256(fn.hash),
        previous: prevSources['unhcr_footnotes'],
        now,
        endpoints: fn.urls,
      }),
      fn.rows,
    );

  const demographics = demo?.byKey ?? fallbackComponent<DemographicsRow>((c) => c.demographics);
  const idmcMap = idmc?.byKey ?? fallbackComponent<IdmcRow>((c) => c.idmc);
  const solutions = sol?.byKey ?? fallbackComponent<SolutionsRow>((c) => c.solutions);
  const solutionsHost = sol?.byHost ?? fallbackComponent<SolutionsRow>((c) => c.solutions_host);
  const appsHost =
    apps?.byHost ?? fallbackComponent<AsylumAppRow>((c) => c.asylum_applications?.host ?? []);
  const appsOrigin =
    apps?.byOrigin ?? fallbackComponent<AsylumAppRow>((c) => c.asylum_applications?.origin ?? []);
  const footnotes = fn?.byKey ?? fallbackComponent<Footnote>((c) => c.footnotes);

  if (pop) {
    // §7.7 step 4: any unmatched entity above threshold → FAIL the source
    const big = pop.unmatched.filter((u) => u.max_value > THRESHOLDS.unmatchedFailAbove);
    if (big.length) {
      stale(
        'unhcr_population',
        new Error(
          `unmatched codes with >${THRESHOLDS.unmatchedFailAbove} persons: ${big.map((b) => `${b.raw}(${b.max_value})`).join(', ')}`,
        ),
      );
    } else {
      const entry = buildSourceEntry({
        id: 'unhcr_population',
        data_as_of: asOf,
        coverage: cov,
        content_hash: sha256(pop.hash),
        previous: prevSources['unhcr_population'],
        now,
        endpoints: pop.urls,
      });
      ok(
        'unhcr_population',
        entry,
        pop.rowCounts.asylum + pop.rowCounts.origin + pop.rowCounts.bilateral,
      );
      coreOk = true;
      const snapshotStamp = entry.retrieved_at; // stable unless content changed (keeps daily diffs empty)
      // Merge small unmatched entries from every source into one report (§7.7 step 5).
      const allUnmatched: UnmatchedEntry[] = [
        ...pop.unmatched,
        ...(demo?.unmatched ?? []),
        ...(idmc?.unmatched ?? []),
        ...(sol?.unmatched ?? []),
        ...(apps?.unmatched ?? []),
      ].sort((a, b) => b.max_value - a.max_value);
      /**
       * The id embedded in bulk CSVs / datapackage. The manifest snapshot_id hashes ALL files
       * (including these CSVs), so it cannot be known before they are written — instead we embed
       * the first 8 hex of the population source's content hash, which is recorded in
       * sources.json (content_hash) and therefore resolvable by any citation reader.
       */
      const csvSnapshotId = entry.content_hash.replace(/^sha256:/, '').slice(0, 8);
      const inp: TransformInput = {
        out: OUT,
        now: snapshotStamp,
        yearMin,
        yearMax: maxYear,
        countries: countriesFile,
        asylum: pop.asylum,
        origin: pop.origin,
        bilateral: pop.bilateral,
        population,
        demographics,
        idmc: idmcMap,
        solutions,
        solutionsHost,
        appsHost,
        appsOrigin,
        footnotes,
        unmatched: allUnmatched,
        sources,
      };
      const used = SOURCE_IDS.filter(
        (s) => sources[s]?.status === 'ok' && s !== 'idmc_idu' && s !== 'unhcr_nowcasting',
      );
      // stock windows
      const recentStart = Math.max(yearMin, maxYear - YEARS.recentWindow + 1);
      const recentYears = allYears.filter((y) => y >= recentStart);
      const historyYears = allYears.filter((y) => y < recentStart);
      const recentStock = buildStock(inp, recentYears, used);
      const recentName = `stock/${recentStart}-${maxYear}.json`;
      writeJsonAtomic(join(OUT, recentName), recentStock);
      stockFiles = [recentName];
      const stocksForTotals = [recentStock];
      if (historyYears.length) {
        const histStock = buildStock(inp, historyYears, used);
        const histName = `stock/${yearMin}-${recentStart - 1}.json`;
        writeJsonAtomic(join(OUT, histName), histStock);
        stockFiles.push(histName);
        stocksForTotals.push(histStock);
      }
      // #14: global totals per year/metric — "share of world" lines on country pages
      writeJsonAtomic(join(OUT, 'world-totals.json'), buildWorldTotals(stocksForTotals));
      // country files
      const countryFiles = buildCountryFiles(inp, allYears, used);
      writeCountryFiles(OUT, countryFiles);
      // flows (Phase 2 data)
      const flowsAll = buildFlows(inp);
      for (const [y, f] of flowsAll) writeJsonAtomic(join(OUT, 'flows', `${y}.json`), f);
      // insight engine — mechanically derived facts, all deep-linkable (see InsightsFile)
      const latestFlowYear = [...flowsAll.keys()].sort((a, b) => b - a)[0];
      writeJsonAtomic(
        join(OUT, 'insights.json'),
        buildInsights(
          stocksForTotals,
          latestFlowYear ? (flowsAll.get(latestFlowYear) ?? null) : null,
          inp,
          maxYear,
        ),
      );
      // downloads + datapackage (snapshot id is finalised in manifest; CSVs carry the data stamp)
      writeDownloads(inp, allYears, csvSnapshotId);
      writeJsonAtomic(join(OUT, 'datapackage.json'), buildDatapackage(inp, csvSnapshotId), true);
      writeUnmatched(OUT, allUnmatched, snapshotStamp);
      log.ok(`core: ${countryFiles.size} country files, ${stockFiles.length} stock files`);
    }
  }

  // ---------- live ----------
  if (!SKIP_LIVE) {
    log.group('live');
    const nc = await attempt('unhcr_nowcasting', () => fetchNowcasting(codes));
    if (nc) {
      const entry = buildSourceEntry({
        id: 'unhcr_nowcasting',
        data_as_of: nc.period ? `${nc.period}-01` : now.slice(0, 10),
        coverage: {
          year_min: Number(nc.period.slice(0, 4)),
          year_max: Number(nc.period.slice(0, 4)),
        },
        content_hash: sha256(nc.hash),
        previous: prevSources['unhcr_nowcasting'],
        now,
        endpoints: [nc.url],
      });
      ok('unhcr_nowcasting', entry, nc.rows.length);
      const sum = (k: 'refugees' | 'asylum_seekers') =>
        nc.rows.reduce<number | null>((s, r) => (r[k] === null ? s : (s ?? 0) + r[k]!), null);
      const file: NowcastFile = {
        schema: 1,
        snapshot: entry.retrieved_at,
        period: nc.period,
        rows: nc.rows,
        total_refugees: sum('refugees'),
        total_asylum_seekers: sum('asylum_seekers'),
        source_id: 'unhcr_nowcasting',
      };
      writeJsonAtomic(join(OUT, 'live', 'nowcast.json'), file);
    }
    const idu = await attempt('idmc_idu', () => fetchIdu(codes));
    if (idu) {
      const dates = idu.events
        .map((e) => e.displacement_date)
        .filter(Boolean)
        .sort();
      const entry = buildSourceEntry({
        id: 'idmc_idu',
        data_as_of: dates[dates.length - 1] ?? now.slice(0, 10),
        coverage: {
          year_min: Number((dates[0] ?? now).slice(0, 4)),
          year_max: Number((dates[dates.length - 1] ?? now).slice(0, 4)),
        },
        content_hash: sha256(idu.hash),
        previous: prevSources['idmc_idu'],
        now,
        endpoints: [idu.url],
      });
      ok('idmc_idu', entry, idu.events.length);
      const byC: IduFile['by_country'] = {};
      for (const e of idu.events) {
        const c = (byC[e.iso3] ??= { events: 0, figure: 0 });
        c.events++;
        c.figure += e.figure ?? 0;
      }
      const file: IduFile = {
        schema: 1,
        snapshot: entry.retrieved_at,
        since: dates[0] ?? '',
        until: dates[dates.length - 1] ?? '',
        count: idu.events.length,
        by_country: byC,
        events: idu.events,
        source_id: 'idmc_idu',
      };
      writeJsonAtomic(join(OUT, 'live', 'idu-latest.json'), file);
    }
  }

  // ---------- sources.json: carry over entries for sources not attempted this run ----------
  for (const id of SOURCE_IDS) {
    if (!sources[id] && prevSources[id]) sources[id] = prevSources[id]!;
  }
  // stable key order
  const orderedSources: SourcesFile = {};
  for (const id of SOURCE_IDS) if (sources[id]) orderedSources[id] = sources[id]!;
  writeJsonAtomic(join(OUT, 'sources.json'), orderedSources, true);

  // ---------- manifest (staging; promote recomputes over the final tree) ----------
  const manifest = buildManifest(OUT, {
    yearMin,
    yearMax: maxYear,
    stockFiles: stockFiles.length ? stockFiles : (prevManifest?.stock_files ?? []),
    prev: prevManifest,
    now,
  });
  writeJsonAtomic(join(OUT, 'manifest.json'), manifest, true);

  // ---------- status ----------
  const status = {
    generated_at: now,
    core_ok: coreOk,
    max_year: maxYear,
    statuses,
    groups: {
      countries: true,
      geo: !!geoRes,
      core: coreOk,
      nowcast:
        !SKIP_LIVE &&
        sources['unhcr_nowcasting']?.status === 'ok' &&
        existsSync(join(OUT, 'live', 'nowcast.json')),
      idu:
        !SKIP_LIVE &&
        sources['idmc_idu']?.status === 'ok' &&
        existsSync(join(OUT, 'live', 'idu-latest.json')),
    },
  };
  writeJsonAtomic(join(OUT, '_status.json'), status, true);
  log.group('summary');
  for (const s of statuses)
    log.info(
      `${s.status === 'ok' ? '✔' : '✖'} ${s.id}${s.rows !== undefined ? ` (${s.rows} rows)` : ''}${s.error ? ` — ${s.error}` : ''}`,
    );
  log.info(`groups: ${JSON.stringify(status.groups)}`);
  if (!coreOk) {
    log.error(
      'core bundle not produced (population failed) — promote will keep the previous snapshot for stock/country files',
    );
  }
}

export function buildManifest(
  dir: string,
  o: { yearMin: number; yearMax: number; stockFiles: string[]; prev: Manifest | null; now: string },
): Manifest {
  const files: Manifest['files'] = {};
  for (const rel of listFiles(dir)) {
    if (rel === 'manifest.json' || rel.startsWith('_')) continue;
    // S9: live/* is ephemeral (replaced daily, not in git) — it is not part of the snapshot's
    // content address. The daily heartbeat survives via sources.json (live retrieved_at changes).
    if (rel.startsWith('live/') || rel.startsWith('live\\')) continue;
    const full = join(dir, rel);
    files[rel] = { sha256: sha256File(full), bytes: readFileSync(full).length };
  }
  const digest = sha256(
    Object.entries(files)
      .map(([k, v]) => `${k}:${v.sha256}`)
      .join('\n'),
  ).slice(0, 8);
  const unchanged = o.prev && o.prev.snapshot_id === digest;
  return {
    schema: 1,
    snapshot_id: digest,
    git_commit:
      process.env.GITHUB_SHA?.slice(0, 7) ?? process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ?? null,
    generated_at: unchanged ? o.prev!.generated_at : o.now,
    year_min: o.yearMin,
    year_max: o.yearMax,
    stock_files: o.stockFiles,
    files,
  };
}

const isMain = process.argv[1] && /run\.ts$/.test(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    log.error(String(e?.stack ?? e));
    process.exit(1);
  });
}
// re-exports for validate/promote
export { CodeRegistry, NON_GEO_ENTITIES, METRIC_IDS };
