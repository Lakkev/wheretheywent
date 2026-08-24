/**
 * Transform: normalised source maps → output files in the staging directory (§7.5, §7.6).
 *   stock/{a}-{b}.json   columnar, two year windows (first-screen + history)
 *   country/{KEY}.json   full detail per entity
 *   flows/{year}.json    bilateral matrix, 2015+ (Phase 2 data, produced now)
 *   downloads/*.csv      RFC 4180 long + wide formats with provenance columns
 *   datapackage.json     Frictionless descriptor
 *   unmatched-report.json
 */
import { join } from 'node:path';
import {
  METRIC_IDS,
  type MetricId,
  type CountriesFile,
  type StockFile,
  type CountryFile,
  type PackedSeries,
  type FlowRow,
  type DemographicsRow,
  type SolutionsRow,
  type IdmcRow,
  type Footnote,
  type AsylumAppRow,
  type SourcesFile,
} from '../../../src/lib/types.ts';
import { pack } from '../../../src/lib/columnar.ts';
import { toCsv } from '../../../src/lib/csv.ts';
import { writeJsonAtomic, writeFileAtomic } from './atomic.ts';
import type { StockMap, BilateralRow, UnmatchedEntry } from '../sources/unhcr-population.ts';
import { YEARS } from '../config.ts';
import { log } from './log.ts';

export interface TransformInput {
  out: string;
  now: string;
  yearMin: number;
  yearMax: number;
  countries: CountriesFile;
  asylum: StockMap;
  origin: StockMap;
  bilateral: BilateralRow[];
  population: Map<string, Map<number, number>> | null; // WPP
  demographics: Map<string, DemographicsRow[]>;
  idmc: Map<string, IdmcRow[]>;
  solutions: Map<string, SolutionsRow[]>;
  solutionsHost: Map<string, SolutionsRow[]>;
  appsHost: Map<string, AsylumAppRow[]>;
  appsOrigin: Map<string, AsylumAppRow[]>;
  footnotes: Map<string, Footnote[]>;
  unmatched: UnmatchedEntry[];
  sources: SourcesFile; // for provenance columns
}

function seriesFor(map: StockMap, key: string, years: number[]): (number | null)[][] {
  const byYear = map.get(key);
  return METRIC_IDS.map((_, mi) => years.map((y) => byYear?.get(y)?.[mi] ?? null));
}

function sumSeries(series: (number | null)[][]): (number | null)[] {
  const n = series[0]?.length ?? 0;
  const out: (number | null)[] = new Array(n).fill(null);
  for (const s of series) {
    for (let i = 0; i < n; i++) {
      const v = s[i];
      if (v === null || v === undefined) continue;
      out[i] = (out[i] ?? 0) + v;
    }
  }
  return out;
}

export function buildStock(inp: TransformInput, years: number[], sourcesUsed: string[]): StockFile {
  const asylum: StockFile['asylum'] = {};
  const origin: StockFile['origin'] = {};
  const population: StockFile['population'] = {};
  const inGeo = new Map(inp.countries.countries.map((c) => [c.iso3, c.in_geo]));
  const unmappable = new Set<string>();
  const totalsA: (number | null)[][] = METRIC_IDS.map(() => years.map(() => null));
  const totalsO: (number | null)[][] = METRIC_IDS.map(() => years.map(() => null));
  const keys = new Set<string>([...inp.asylum.keys(), ...inp.origin.keys()]);
  for (const key of [...keys].sort()) {
    const a = seriesFor(inp.asylum, key, years);
    const o = seriesFor(inp.origin, key, years);
    const hasA = a.some((s) => s.some((v) => v !== null));
    const hasO = o.some((s) => s.some((v) => v !== null));
    if (hasA) asylum[key] = { v: a.map(pack) };
    if (hasO) origin[key] = { v: o.map(pack) };
    if ((hasA || hasO) && !inGeo.get(key)) unmappable.add(key);
    for (let mi = 0; mi < METRIC_IDS.length; mi++) {
      for (let yi = 0; yi < years.length; yi++) {
        const va = a[mi]![yi];
        if (va !== null && va !== undefined) totalsA[mi]![yi] = (totalsA[mi]![yi] ?? 0) + va;
        const vo = o[mi]![yi];
        if (vo !== null && vo !== undefined) totalsO[mi]![yi] = (totalsO[mi]![yi] ?? 0) + vo;
      }
    }
  }
  if (inp.population) {
    for (const c of inp.countries.countries) {
      const m = inp.population.get(c.iso3);
      if (!m) continue;
      const s = years.map((y) => m.get(y) ?? null);
      if (s.some((v) => v !== null)) population[c.iso3] = pack(s);
    }
  }
  return {
    schema: 1,
    snapshot: inp.now,
    years,
    metrics: [...METRIC_IDS],
    asylum,
    origin,
    population,
    totals: { asylum: totalsA.map(pack), origin: totalsO.map(pack) },
    unmappable: [...unmappable].sort(),
    sources: sourcesUsed,
  };
}

const TOP_N = 10;
const TOP_FROM = 2000;

function topFlows(
  bilateral: BilateralRow[],
  keyField: 'coa' | 'coo',
  partnerField: 'coo' | 'coa',
): Map<string, Record<string, FlowRow[]>> {
  // group by key → year → rows
  const grouped = new Map<string, Map<number, BilateralRow[]>>();
  for (const r of bilateral) {
    if (r.year < TOP_FROM) continue;
    const score = (r.refugees ?? 0) + (r.asylum_seekers ?? 0);
    if (score <= 0) continue;
    const k = r[keyField];
    let byYear = grouped.get(k);
    if (!byYear) grouped.set(k, (byYear = new Map()));
    const arr = byYear.get(r.year) ?? [];
    arr.push(r);
    byYear.set(r.year, arr);
  }
  const out = new Map<string, Record<string, FlowRow[]>>();
  for (const [k, byYear] of grouped) {
    const rec: Record<string, FlowRow[]> = {};
    for (const [y, rows] of byYear) {
      rows.sort(
        (a, b) =>
          (b.refugees ?? 0) +
          (b.asylum_seekers ?? 0) -
          ((a.refugees ?? 0) + (a.asylum_seekers ?? 0)),
      );
      rec[String(y)] = rows.slice(0, TOP_N).map((r) => ({
        p: r[partnerField],
        refugees: r.refugees,
        asylum_seekers: r.asylum_seekers,
      }));
    }
    out.set(k, rec);
  }
  return out;
}

export function buildCountryFiles(
  inp: TransformInput,
  years: number[],
  sourcesUsed: string[],
): Map<string, CountryFile> {
  const topOrigins = topFlows(inp.bilateral, 'coa', 'coo');
  const topHosts = topFlows(inp.bilateral, 'coo', 'coa');
  const out = new Map<string, CountryFile>();
  for (const meta of inp.countries.countries) {
    const key = meta.iso3;
    const popMap = inp.population?.get(key);
    const popSeries = years.map((y) => popMap?.get(y) ?? null);
    const file: CountryFile = {
      schema: 1,
      snapshot: inp.now,
      iso3: key,
      meta,
      years,
      metrics: [...METRIC_IDS],
      asylum: { v: seriesFor(inp.asylum, key, years).map(pack) },
      origin: { v: seriesFor(inp.origin, key, years).map(pack) },
      population: pack(popSeries),
      demographics: inp.demographics.get(key) ?? [],
      top_origins: topOrigins.get(key) ?? {},
      top_hosts: topHosts.get(key) ?? {},
      solutions: inp.solutions.get(key) ?? [],
      solutions_host: inp.solutionsHost.get(key) ?? [],
      asylum_applications: {
        host: inp.appsHost.get(key) ?? [],
        origin: inp.appsOrigin.get(key) ?? [],
      },
      idmc: inp.idmc.get(key) ?? [],
      footnotes: inp.footnotes.get(key) ?? [],
      sources: sourcesUsed,
    };
    out.set(key, file);
  }
  return out;
}

export function buildFlows(
  inp: TransformInput,
): Map<number, { year: number; rows: [string, string, number | null, number | null][] }> {
  const byYear = new Map<number, [string, string, number | null, number | null][]>();
  for (const r of inp.bilateral) {
    if (r.year < YEARS.flowsFrom) continue;
    if ((r.refugees ?? 0) + (r.asylum_seekers ?? 0) <= 0) continue;
    const arr = byYear.get(r.year) ?? [];
    arr.push([r.coo, r.coa, r.refugees, r.asylum_seekers]);
    byYear.set(r.year, arr);
  }
  const out = new Map<
    number,
    { year: number; rows: [string, string, number | null, number | null][] }
  >();
  for (const [y, rows] of byYear) {
    rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    out.set(y, { year: y, rows });
  }
  return out;
}

/** CSV downloads. Provenance travels as columns (§10.4). */
export function writeDownloads(inp: TransformInput, years: number[], snapshotId: string) {
  const src = inp.sources['unhcr_population'];
  const asOf = src?.data_as_of ?? `${inp.yearMax}-12-31`;
  const retrieved = src?.retrieved_at ?? inp.now;
  const attribution = src?.attribution ?? 'UNHCR Refugee Population Statistics Database';
  const nameOf = new Map(inp.countries.countries.map((c) => [c.iso3, c.name]));
  const dir = join(inp.out, 'downloads');

  // Long format — all views/metrics/years, non-null only
  const longHeader = [
    'iso3',
    'country_name',
    'view',
    'year',
    'metric',
    'value',
    'unit',
    'source_id',
    'source_attribution',
    'data_as_of',
    'retrieved_at',
    'snapshot_id',
  ];
  const longRows: (string | number | null)[][] = [];
  const wideRows: Record<'asylum' | 'origin', (string | number | null)[][]> = {
    asylum: [],
    origin: [],
  };
  for (const view of ['asylum', 'origin'] as const) {
    const map = view === 'asylum' ? inp.asylum : inp.origin;
    for (const key of [...map.keys()].sort()) {
      const byYear = map.get(key)!;
      for (const y of years) {
        const vals = byYear.get(y);
        if (!vals) continue;
        if (vals.every((v) => v === null)) continue;
        wideRows[view].push([
          key,
          nameOf.get(key) ?? key,
          y,
          ...vals,
          'unhcr_population',
          asOf,
          retrieved,
          snapshotId,
        ]);
        vals.forEach((v, mi) => {
          if (v === null) return;
          const m = METRIC_IDS[mi]!;
          longRows.push([
            key,
            nameOf.get(key) ?? key,
            view,
            y,
            m,
            v,
            'persons',
            m === 'idps' ? 'unhcr_idmc' : 'unhcr_population',
            attribution,
            asOf,
            retrieved,
            snapshotId,
          ]);
        });
      }
    }
  }
  writeFileAtomic(join(dir, 'unhcr-population-all-years.csv'), toCsv(longHeader, longRows));
  const wideHeader = [
    'iso3',
    'country_name',
    'year',
    ...METRIC_IDS,
    'source_id',
    'data_as_of',
    'retrieved_at',
    'snapshot_id',
  ];
  writeFileAtomic(join(dir, 'unhcr-population-by-asylum.csv'), toCsv(wideHeader, wideRows.asylum));
  writeFileAtomic(join(dir, 'unhcr-population-by-origin.csv'), toCsv(wideHeader, wideRows.origin));

  // countries
  writeFileAtomic(
    join(dir, 'countries.csv'),
    toCsv(
      [
        'iso3',
        'iso2',
        'name_unhcr',
        'display_name',
        'region',
        'in_unhcr',
        'in_geo',
        'in_wpp',
        'centroid_lon',
        'centroid_lat',
      ],
      inp.countries.countries.map((c) => [
        c.iso3,
        c.iso2,
        c.name,
        c.display_name,
        c.region,
        c.in_unhcr ? 1 : 0,
        c.in_geo ? 1 : 0,
        c.in_wpp ? 1 : 0,
        c.centroid?.[0] ?? null,
        c.centroid?.[1] ?? null,
      ]),
    ),
  );
  // population (WPP)
  if (inp.population) {
    const ws = inp.sources['wpp_population'];
    const rows: (string | number | null)[][] = [];
    for (const c of inp.countries.countries) {
      const m = inp.population.get(c.iso3);
      if (!m) continue;
      for (const y of years) {
        const v = m.get(y);
        if (v === undefined) continue;
        rows.push([
          c.iso3,
          c.name,
          y,
          v,
          'wpp_population',
          ws?.data_as_of ?? '',
          ws?.retrieved_at ?? inp.now,
          snapshotId,
        ]);
      }
    }
    writeFileAtomic(
      join(dir, 'wpp-total-population.csv'),
      toCsv(
        [
          'iso3',
          'country_name',
          'year',
          'population',
          'source_id',
          'data_as_of',
          'retrieved_at',
          'snapshot_id',
        ],
        rows,
      ),
    );
  }
  log.info(
    `downloads: long ${longRows.length} rows, wide ${wideRows.asylum.length}/${wideRows.origin.length}`,
  );
}

export function buildDatapackage(inp: TransformInput, snapshotId: string) {
  const field = (name: string, type: string, description?: string) => ({
    name,
    type,
    ...(description ? { description } : {}),
  });
  const prov = [
    field('source_id', 'string', 'Key into sources.json'),
    field('data_as_of', 'date', 'Upstream coverage date'),
    field('retrieved_at', 'datetime', 'When the data was fetched'),
    field('snapshot_id', 'string', 'Content-addressed snapshot id'),
  ];
  const metricFields = METRIC_IDS.map((m) => field(m, 'integer', 'Persons; empty = not reported'));
  return {
    profile: 'tabular-data-package',
    name: 'where-they-went',
    title: 'Where They Went — forced displacement statistics',
    version: snapshotId,
    created: inp.now,
    homepage: process.env.PUBLIC_SITE_URL ?? 'https://wheretheywent.lakkev.com',
    licenses: [
      {
        name: 'CC-BY-4.0',
        path: 'https://creativecommons.org/licenses/by/4.0/',
        title: 'Creative Commons Attribution 4.0 (UNHCR data)',
      },
      {
        name: 'CC-BY-3.0-IGO',
        path: 'https://creativecommons.org/licenses/by/3.0/igo/',
        title: 'CC BY 3.0 IGO (UN WPP, IDMC)',
      },
    ],
    sources: Object.entries(inp.sources).map(([id, s]) => ({
      title: `${s.publisher}: ${s.title}`,
      path: s.landing_page,
      id,
    })),
    resources: [
      {
        name: 'unhcr-population-all-years',
        path: 'downloads/unhcr-population-all-years.csv',
        format: 'csv',
        mediatype: 'text/csv',
        encoding: 'utf-8',
        dialect: { delimiter: ',', header: true, lineTerminator: '\n' },
        schema: {
          fields: [
            field('iso3', 'string'),
            field('country_name', 'string'),
            field('view', 'string', 'asylum | origin'),
            field('year', 'year'),
            field('metric', 'string'),
            field('value', 'integer'),
            field('unit', 'string'),
            ...prov.slice(0, 1),
            field('source_attribution', 'string'),
            ...prov.slice(1),
          ],
          primaryKey: ['iso3', 'view', 'year', 'metric'],
        },
      },
      ...(['asylum', 'origin'] as const).map((v) => ({
        name: `unhcr-population-by-${v}`,
        path: `downloads/unhcr-population-by-${v}.csv`,
        format: 'csv',
        mediatype: 'text/csv',
        encoding: 'utf-8',
        dialect: { delimiter: ',', header: true, lineTerminator: '\n' },
        schema: {
          fields: [
            field('iso3', 'string'),
            field('country_name', 'string'),
            field('year', 'year'),
            ...metricFields,
            ...prov,
          ],
          primaryKey: ['iso3', 'year'],
        },
      })),
      {
        name: 'countries',
        path: 'downloads/countries.csv',
        format: 'csv',
        mediatype: 'text/csv',
        encoding: 'utf-8',
        schema: {
          fields: [
            field('iso3', 'string'),
            field('iso2', 'string'),
            field('name_unhcr', 'string'),
            field('display_name', 'string'),
            field('region', 'string'),
            field('in_unhcr', 'boolean'),
            field('in_geo', 'boolean'),
            field('in_wpp', 'boolean'),
            field('centroid_lon', 'number'),
            field('centroid_lat', 'number'),
          ],
          primaryKey: ['iso3'],
        },
      },
      {
        name: 'wpp-total-population',
        path: 'downloads/wpp-total-population.csv',
        format: 'csv',
        mediatype: 'text/csv',
        encoding: 'utf-8',
        schema: {
          fields: [
            field('iso3', 'string'),
            field('country_name', 'string'),
            field('year', 'year'),
            field('population', 'integer', 'Mid-year total population, persons'),
            ...prov,
          ],
          primaryKey: ['iso3', 'year'],
        },
      },
    ],
  };
}

export function writeCountryFiles(outDir: string, files: Map<string, CountryFile>) {
  for (const [key, f] of files) writeJsonAtomic(join(outDir, 'country', `${key}.json`), f);
}

export function writeUnmatched(outDir: string, unmatched: UnmatchedEntry[], stamp: string) {
  // `stamp` is the population retrieved_at (stable unless content changed) so this file does not churn daily
  writeJsonAtomic(
    join(outDir, 'unmatched-report.json'),
    { schema: 1, snapshot: stamp, count: unmatched.length, entries: unmatched },
    true,
  );
}

/** Cheap structural check that a PackedSeries round-trips (used by validate too). */
export function isPacked(x: unknown): x is PackedSeries {
  return (
    Array.isArray(x) &&
    x.every(
      (c) =>
        c === null ||
        typeof c === 'number' ||
        (Array.isArray(c) && (c[0] === 'z' || c[0] === 'n') && typeof c[1] === 'number'),
    )
  );
}
