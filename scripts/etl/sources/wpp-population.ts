/**
 * UN WPP 2024 total population (per-1,000 denominator, §3.6 / A.4).
 * Downloads the 16 MiB gz CSV, keeps Medium-variant Country/Area rows with an ISO3 code,
 * converts thousands → persons, and returns key → year → population.
 * Fallback: World Bank SP.POP.TOTL (UTF-8 BOM! no Taiwan) when WPP is unreachable.
 */
import { gunzipSync } from 'node:zlib';
import { WPP, YEARS } from '../config.ts';
import { fetchBuffer, fetchJson } from '../lib/http.ts';
import { sha256 } from '../lib/atomic.ts';
import { log } from '../lib/log.ts';

export interface WppResult {
  byKey: Map<string, Map<number, number>>; // persons
  names: Map<string, string>; // WPP location names (for display-name overrides / audit)
  baseYear: number; // last year of estimates (projection starts after)
  hash: string;
  url: string;
  provider: 'wpp' | 'worldbank';
}

/** Quote-aware single-line CSV split (WPP rows never contain embedded newlines). */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export async function fetchWpp(maxYear: number): Promise<WppResult> {
  const gz = await fetchBuffer(WPP.url);
  const text = gunzipSync(gz)
    .toString('utf8')
    .replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const header = splitLine(lines[0]!);
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`wpp: missing column ${name}`);
    return i;
  };
  const cIso = col('ISO3_code'),
    cType = col('LocTypeName'),
    cVar = col('Variant'),
    cTime = col('Time'),
    cPop = col('PopTotal'),
    cLoc = col('Location');
  const byKey = new Map<string, Map<number, number>>();
  const names = new Map<string, string>();
  const yMax = Math.max(maxYear, 2030); // keep a few projection years for future ETL runs
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) continue;
    const f = splitLine(line);
    if (f[cType] !== 'Country/Area') continue;
    if (f[cVar] !== WPP.variant) continue;
    const iso3 = (f[cIso] ?? '').trim().toUpperCase();
    if (!iso3) continue;
    const y = Number(f[cTime]);
    if (!Number.isInteger(y) || y < YEARS.min - 1 || y > yMax) continue;
    const thousands = Number(f[cPop]);
    if (!Number.isFinite(thousands)) continue;
    let m = byKey.get(iso3);
    if (!m) {
      byKey.set(iso3, (m = new Map()));
      names.set(iso3, f[cLoc] ?? iso3);
    }
    m.set(y, Math.round(thousands * 1000));
  }
  // WPP 2024: estimates through 2023, projections from 2024
  const baseYear = 2023;
  log.info(`wpp: ${byKey.size} countries, ${lines.length} lines`);
  return { byKey, names, baseYear, hash: sha256(gz), url: WPP.url, provider: 'wpp' };
}

/** World Bank fallback (latest value per country only — good enough for per-1k on recent years). */
export async function fetchWorldBankFallback(): Promise<WppResult> {
  type WbRow = {
    countryiso3code: string;
    date: string;
    value: number | null;
    country: { value: string };
  };
  const data = await fetchJson<[unknown, WbRow[]]>(WPP.worldBankUrl);
  const rows = data[1] ?? [];
  const byKey = new Map<string, Map<number, number>>();
  const names = new Map<string, string>();
  for (const r of rows) {
    if (!r.countryiso3code || r.value == null) continue;
    const m = byKey.get(r.countryiso3code) ?? new Map<number, number>();
    m.set(Number(r.date), r.value);
    byKey.set(r.countryiso3code, m);
    names.set(r.countryiso3code, r.country?.value ?? r.countryiso3code);
  }
  log.warn(`wpp: using World Bank fallback (${byKey.size} countries, latest year only)`);
  return {
    byKey,
    names,
    baseYear: 2025,
    hash: sha256(JSON.stringify(rows)),
    url: WPP.worldBankUrl,
    provider: 'worldbank',
  };
}
