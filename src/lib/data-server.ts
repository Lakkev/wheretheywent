/**
 * Build-time (server-side, Astro SSG) access to public/data/v1.
 * Only import from .astro frontmatter or other build-time code — never from islands.
 * Every reader tolerates a missing file (pre-ETL skeleton builds) and returns null.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Manifest,
  SourcesFile,
  MetricsFile,
  CountriesFile,
  CountryFile,
  StockFile,
  DisputedNotes,
  NowcastFile,
  IduFile,
  WorldTotalsFile,
} from './types';

const ROOT = join(process.cwd(), 'public', 'data', 'v1');

function readJson<T>(rel: string): T | null {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) as T;
  } catch {
    return null;
  }
}

export const getManifest = () => readJson<Manifest>('manifest.json');
export const getSources = () => readJson<SourcesFile>('sources.json');
export const getMetrics = () => readJson<MetricsFile>('metrics.json');
export const getCountries = () => readJson<CountriesFile>('countries.json');
export const getDisputedNotes = () => readJson<DisputedNotes>('geo/disputed-notes.json');
export const getNowcast = () => readJson<NowcastFile>('live/nowcast.json');
export const getIdu = () => readJson<IduFile>('live/idu-latest.json');
export const getWorldTotals = () => readJson<WorldTotalsFile>('world-totals.json');
export const getCountry = (iso3: string) => readJson<CountryFile>(`country/${iso3}.json`);

export function getStockRecent(): StockFile | null {
  const dir = join(ROOT, 'stock');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  // the file whose range ends at the max year is the "recent" one
  let best: { file: string; end: number } | null = null;
  for (const f of files) {
    const m = /^(\d{4})-(\d{4})\.json$/.exec(f);
    if (!m) continue;
    const end = Number(m[2]);
    if (!best || end > best.end) best = { file: f, end };
  }
  return best ? readJson<StockFile>(`stock/${best.file}`) : null;
}

export function listCountryIso3(): string[] {
  const dir = join(ROOT, 'country');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^[A-Z0-9_]{3,4}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

export function listDownloads(): { name: string; bytes: number }[] {
  const dir = join(ROOT, 'downloads');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => !f.startsWith('.'))
    .map((f) => ({ name: f, bytes: statSync(join(dir, f)).size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
