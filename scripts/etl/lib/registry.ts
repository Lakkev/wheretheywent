/**
 * Country registry: merges UNHCR /countries/, the geometry index, WPP coverage and display
 * overrides into countries.json (§6, §11.3). Canonical key = ISO3 (or documented pseudo code).
 */
import { readFileSync } from 'node:fs';
import type { CountriesFile, CountryMeta } from '../../../src/lib/types.ts';
import type { UnhcrCountry } from '../sources/unhcr-countries.ts';
import type { GeoIndex } from '../geo/build-geo.ts';
import { NON_GEO_ENTITIES, regionSlug, CodeRegistry } from './codes.ts';
import { PATHS } from '../config.ts';

interface DisplayOverride {
  display_name?: string;
  display_name_zh?: string;
  note?: string;
  note_zh?: string;
  region?: string;
}

export function loadDisplayOverrides(): Record<string, DisplayOverride> {
  const raw = JSON.parse(readFileSync(PATHS.displayOverrides, 'utf8')) as Record<
    string,
    DisplayOverride | string
  >;
  const out: Record<string, DisplayOverride> = {};
  for (const [k, v] of Object.entries(raw))
    if (!k.startsWith('_') && typeof v === 'object') out[k] = v;
  return out;
}

const MAJOR_AREAS = [
  'Africa',
  'Asia',
  'Europe',
  'Latin America and the Caribbean',
  'Northern America',
  'Oceania',
];

/** Fallback region for geo-only territories (ISO3 → UN major area). Keep tiny; most are in UNHCR. */
const GEO_ONLY_REGION: Record<string, string> = {
  TWN: 'Asia',
  XKX: 'Europe',
  GRL: 'Northern America',
  ATF: 'Africa',
  SXM: 'Latin America and the Caribbean',
  ALA: 'Europe',
  FLK: 'Latin America and the Caribbean',
  SJM: 'Europe',
  BLM: 'Latin America and the Caribbean',
  MAF: 'Latin America and the Caribbean',
  IOT: 'Asia',
  HMD: 'Oceania',
  UMI: 'Oceania',
  PCN: 'Oceania',
  NFK: 'Oceania',
  CXR: 'Oceania',
  CCK: 'Oceania',
  GGY: 'Europe',
  JEY: 'Europe',
  IMN: 'Europe',
  SPM: 'Northern America',
};

export function buildRegistry(args: {
  unhcr: UnhcrCountry[];
  geo: GeoIndex;
  wppKeys: Set<string>;
  wppNames: Map<string, string>;
}): { file: CountriesFile; codes: CodeRegistry } {
  const overrides = loadDisplayOverrides();
  const byKey = new Map<string, CountryMeta>();

  const regionOf = (major: string | null | undefined, key: string): string => {
    if (major && MAJOR_AREAS.includes(major)) return major;
    if (overrides[key]?.region) return overrides[key]!.region!;
    if (GEO_ONLY_REGION[key]) return GEO_ONLY_REGION[key]!;
    return 'Other';
  };

  for (const c of args.unhcr) {
    const g = args.geo.features[c.key];
    const o = overrides[c.key] ?? {};
    const region = regionOf(c.majorArea, c.key);
    const meta: CountryMeta = {
      iso3: c.key,
      iso2: c.iso2,
      name: c.name,
      display_name: o.display_name ?? c.name,
      unhcr_code: c.unhcr_code,
      region,
      region_slug: regionSlug(region),
      centroid: g?.centroid ?? null,
      bbox: g?.bbox ?? null,
      in_unhcr: true,
      in_geo: !!g && g.fill,
      in_wpp: args.wppKeys.has(c.key),
    };
    if (o.display_name_zh) meta.display_name_zh = o.display_name_zh;
    if (o.note) meta.note = o.note;
    if (o.note_zh) meta.note_zh = o.note_zh;
    byKey.set(c.key, meta);
  }
  // geometry-only entities (drawn, no UNHCR row) — e.g. TWN, XKX, GRL
  for (const [key, g] of Object.entries(args.geo.features)) {
    if (key.startsWith('_') || byKey.has(key)) continue;
    const o = overrides[key] ?? {};
    const region = regionOf(null, key);
    const meta: CountryMeta = {
      iso3: key,
      iso2: null,
      name: o.display_name ?? g.name,
      display_name: o.display_name ?? g.name,
      unhcr_code: null,
      region,
      region_slug: regionSlug(region),
      centroid: g.centroid,
      bbox: g.bbox,
      in_unhcr: false,
      in_geo: g.fill,
      in_wpp: args.wppKeys.has(key),
    };
    if (o.display_name_zh) meta.display_name_zh = o.display_name_zh;
    meta.note = o.note ?? 'Not separately reported by UNHCR.';
    if (o.note_zh) meta.note_zh = o.note_zh;
    byKey.set(key, meta);
  }
  // pseudo entities that may appear only in data (OTH, AB9)
  for (const key of NON_GEO_ENTITIES) {
    if (byKey.has(key)) continue;
    const o = overrides[key] ?? {};
    byKey.set(key, {
      iso3: key,
      iso2: null,
      name: o.display_name ?? key,
      display_name: o.display_name ?? key,
      display_name_zh: o.display_name_zh,
      unhcr_code: null,
      region: 'Other',
      region_slug: 'other',
      centroid: null,
      bbox: null,
      in_unhcr: false,
      in_geo: false,
      in_wpp: false,
      note: o.note,
      note_zh: o.note_zh,
    });
  }

  const countries = [...byKey.values()].sort((a, b) => a.iso3.localeCompare(b.iso3));
  const regionSet = new Map<string, string>();
  for (const c of countries) regionSet.set(c.region_slug, c.region);
  const regions = [...regionSet.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) =>
      a.slug === 'other' ? 1 : b.slug === 'other' ? -1 : a.name.localeCompare(b.name),
    );

  const codes = new CodeRegistry(countries.map((c) => c.iso3));
  return { file: { schema: 1, count: countries.length, regions, countries }, codes };
}
