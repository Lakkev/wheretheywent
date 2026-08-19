/**
 * /countries/ → raw UNHCR country list. iso may be null (CRB/CUR/SGS) → resolved via ISO_OVERRIDES.
 * Output is the authoritative "who exists in UNHCR" list; the registry (lib/registry.ts) merges it
 * with geometry and WPP coverage.
 */
import { fetchJson } from '../lib/http.ts';
import { unhcrUrl } from '../lib/paginate.ts';
import { sha256 } from '../lib/atomic.ts';
import { ISO_OVERRIDES, isIso3Shape, KNOWN_COLLISIONS } from '../lib/codes.ts';
import { log } from '../lib/log.ts';

export interface UnhcrCountryRaw {
  id: number;
  code: string; // INTERNAL — audit only
  iso: string | null;
  iso2: string | null;
  name: string;
  majorArea: string | null;
  region: string | null;
}

export interface UnhcrCountry {
  key: string; // canonical ISO3 / pseudo key
  unhcr_code: string;
  unhcr_id: number;
  iso2: string | null;
  name: string;
  majorArea: string | null;
  subregion: string | null;
}

export async function fetchUnhcrCountries(): Promise<{
  countries: UnhcrCountry[];
  hash: string;
  url: string;
}> {
  const url = unhcrUrl('countries', { limit: 500 });
  const page = await fetchJson<{ items: UnhcrCountryRaw[]; maxPages: number }>(url);
  const items = page.items ?? [];
  const hash = sha256(JSON.stringify(items));
  const countries: UnhcrCountry[] = [];
  for (const c of items) {
    let key: string | null = null;
    const isoRaw = (c.iso ?? '').trim().toUpperCase();
    const code = (c.code ?? '').trim().toUpperCase();
    if (isoRaw && isoRaw in ISO_OVERRIDES) key = ISO_OVERRIDES[isoRaw] ?? null;
    else if (isoRaw && isIso3Shape(isoRaw)) key = isoRaw;
    else if (!isoRaw && code in ISO_OVERRIDES)
      key = ISO_OVERRIDES[code] ?? null; // CRB, CUR
    else if (!isoRaw && isIso3Shape(code) && !KNOWN_COLLISIONS.some((k) => k.internal === code)) {
      // iso null and code looks like ISO3 (SGS). Accept code only when it is not a known collision.
      key = code;
      log.warn(`countries: "${c.name}" has iso=null; using code ${code} as ISO3 (verify!)`);
    }
    if (!key) {
      log.warn(`countries: cannot key "${c.name}" (code=${c.code}, iso=${c.iso}) — skipped`);
      continue;
    }
    countries.push({
      key,
      unhcr_code: c.code,
      unhcr_id: c.id,
      iso2: c.iso2 ?? null,
      name: (c.name ?? '').trim(),
      majorArea: c.majorArea ?? null,
      subregion: c.region ?? null,
    });
  }
  log.info(`countries: ${countries.length} of ${items.length} keyed`);
  return { countries, hash, url };
}
