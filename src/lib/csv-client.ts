/**
 * Client-side downloads: CSV (RFC 4180 strict, optional # comments) and JSON with full meta
 * (permalink + the four citation strings). Pure builders + a tiny browser saver.
 */
import { toCsv, type CsvCell } from './csv';
import type { SourceEntry } from './types';
import type { Citations } from './citation';

export interface ProvenanceMeta {
  source_id: string;
  source_attribution: string;
  data_as_of: string;
  retrieved_at: string;
  snapshot_id: string;
}

export interface ViewExportRow {
  iso3: string;
  country_name: string;
  year: number;
  metric: string;
  view: string;
  value: number | null;
  per_1000: number | null;
  population: number | null;
  rank: number | null;
}

export const VIEW_CSV_HEADER = [
  'iso3',
  'country_name',
  'view',
  'year',
  'metric',
  'value',
  'unit',
  'per_1000_residents',
  'population',
  'rank',
  'source_id',
  'source_attribution',
  'data_as_of',
  'retrieved_at',
  'snapshot_id',
] as const;

export function viewRowsToCsv(
  rows: ViewExportRow[],
  prov: ProvenanceMeta,
  opts: { comments?: string[] } = {},
): string {
  const data: CsvCell[][] = rows.map((r) => [
    r.iso3,
    r.country_name,
    r.view,
    r.year,
    r.metric,
    r.value,
    'persons',
    r.per_1000 === null ? null : Math.round(r.per_1000 * 1000) / 1000,
    r.population,
    r.rank,
    prov.source_id,
    prov.source_attribution,
    prov.data_as_of,
    prov.retrieved_at,
    prov.snapshot_id,
  ]);
  return toCsv(VIEW_CSV_HEADER, data, { comments: opts.comments });
}

/** Comment lines (only when the user opts in — §10.4). */
export function provenanceComments(
  prov: ProvenanceMeta,
  permalink: string,
  title: string,
  extra: string[] = [],
): string[] {
  return [
    `title: ${title}`,
    `permalink: ${permalink}`,
    `source: ${prov.source_attribution} (${prov.source_id})`,
    `data_as_of: ${prov.data_as_of}`,
    `retrieved_at: ${prov.retrieved_at}`,
    `snapshot_id: ${prov.snapshot_id}`,
    'license: CC BY 4.0 (UNHCR); see DATA-LICENSE.md',
    ...extra,
  ];
}

export interface JsonExport<T> {
  meta: {
    title: string;
    permalink: string;
    generated_at: string;
    snapshot_id: string;
    sources: Record<
      string,
      Pick<
        SourceEntry,
        | 'publisher'
        | 'title'
        | 'attribution'
        | 'license'
        | 'data_as_of'
        | 'retrieved_at'
        | 'landing_page'
      >
    >;
    citations: Citations;
    notes: string[];
  };
  data: T;
}

export function buildJsonExport<T>(args: {
  title: string;
  permalink: string;
  snapshotId: string;
  sources: Record<string, SourceEntry>;
  citations: Citations;
  notes?: string[];
  data: T;
}): JsonExport<T> {
  const sources: JsonExport<T>['meta']['sources'] = {};
  for (const [id, s] of Object.entries(args.sources))
    sources[id] = {
      publisher: s.publisher,
      title: s.title,
      attribution: s.attribution,
      license: s.license,
      data_as_of: s.data_as_of,
      retrieved_at: s.retrieved_at,
      landing_page: s.landing_page,
    };
  return {
    meta: {
      title: args.title,
      permalink: args.permalink,
      generated_at: new Date().toISOString(),
      snapshot_id: args.snapshotId,
      sources,
      citations: args.citations,
      notes: args.notes ?? [],
    },
    data: args.data,
  };
}

/** Trigger a browser download. */
export function saveFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
