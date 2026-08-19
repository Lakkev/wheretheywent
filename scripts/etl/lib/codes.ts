/**
 * ★★ ISO3 normalization and UNHCR internal-code protection (§3.1, §7.7).
 *
 * UNHCR's `coo`/`coa` fields are INTERNAL codes, not ISO3, and collide with real ISO3s:
 *   AUS → Austria (AUT)   ARE → Egypt (EGY)   MAR → Martinique (MTQ)
 * Rules enforced here:
 *   1. Only `coo_iso`/`coa_iso` are ever read.
 *   2. `sanitizeRow()` deletes `coo`/`coa`/`coo_id`/`coa_id` and installs throwing getters so any
 *      downstream access is a loud failure, not a silent mis-key.
 *   3. Non-ISO entities are mapped via OVERRIDES; anything else is "unmatched" and reported.
 */

/** Canonical join key. Non-ISO pseudo-codes are UPPERCASE 3–4 chars and documented here. */
export const PSEUDO = {
  STATELESS: 'XXA', // UNHCR "Stateless" origin (code STA, iso XXA)
  UNKNOWN: 'UNK', // UNHCR "Unknown" (code UKN, iso UNK)
  TIBETAN: 'TIB', // UNHCR "Tibetan" origin, region "Various"
  CARIBBEAN: 'CRB', // UNHCR Caribbean aggregate (iso null)
  KOSOVO: 'XKX', // not in UNHCR (merged into SRB); drawn from NE geometry
  ABYEI: 'AB9', // IDMC Abyei Area (appears in /idmc/)
  OTHER: 'OTH', // bucket for small unmatched entities (§7.7 step 5)
  AGGREGATE: '-', // UNHCR uses "-" for "all" when coa_all/coo_all aggregation is applied
} as const;

/**
 * Overrides for *_iso values that are not ISO 3166-1 alpha-3 or that need remapping.
 * key = value as it appears in `coo_iso`/`coa_iso` (or `iso` in /countries/), value = canonical key
 * (or null to drop the row entirely).
 */
export const ISO_OVERRIDES: Record<string, string | null> = {
  CRB: PSEUDO.CARIBBEAN,
  CUR: 'CUW', // UNHCR Curaçao has iso null, code CUR; ISO3 is CUW
  UNK: PSEUDO.UNKNOWN,
  UKN: PSEUDO.UNKNOWN,
  TIB: PSEUDO.TIBETAN,
  XXA: PSEUDO.STATELESS,
  STA: PSEUDO.STATELESS,
  XKX: PSEUDO.KOSOVO,
  AB9: PSEUDO.ABYEI,
  '-': null, // aggregate marker on the "other" dimension — not a country
  '': null,
  ' ': null,
};

/** Pseudo-entities that are legitimate data holders but never drawn on the map. */
export const NON_GEO_ENTITIES = new Set<string>([
  PSEUDO.STATELESS,
  PSEUDO.UNKNOWN,
  PSEUDO.TIBETAN,
  PSEUDO.CARIBBEAN,
  PSEUDO.ABYEI,
  PSEUDO.OTHER,
]);

/**
 * The three known collisions — kept as data so tests and validate.ts can assert them.
 * `internal` is UNHCR's code, `iso` is the real ISO3 of the SAME country, `collidesWith` is the
 * different country whose real ISO3 equals the internal code.
 */
export const KNOWN_COLLISIONS = [
  { internal: 'AUS', iso: 'AUT', name: 'Austria', collidesWith: 'Australia' },
  { internal: 'ARE', iso: 'EGY', name: 'Egypt', collidesWith: 'United Arab Emirates' },
  { internal: 'MAR', iso: 'MTQ', name: 'Martinique', collidesWith: 'Morocco' },
] as const;

const ISO3_RE = /^[A-Z]{3}$/;

export function isIso3Shape(s: string): boolean {
  return ISO3_RE.test(s);
}

export interface NormalizeResult {
  /** canonical key, or null when the row must be dropped (aggregate marker / empty) */
  key: string | null;
  /** true when the value was a real ISO3 found in the registry */
  matched: boolean;
  /** true when resolved through ISO_OVERRIDES */
  overridden: boolean;
  raw: string;
}

export class CodeRegistry {
  private known = new Set<string>();
  constructor(knownIso3: Iterable<string>) {
    for (const k of knownIso3) this.known.add(k);
    for (const v of Object.values(ISO_OVERRIDES)) if (v) this.known.add(v);
  }
  has(key: string) {
    return this.known.has(key);
  }
  add(key: string) {
    this.known.add(key);
  }
  /** Normalize a value read from an `*_iso` field. */
  normalize(raw: unknown): NormalizeResult {
    const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (s in ISO_OVERRIDES) {
      const v = ISO_OVERRIDES[s]!;
      return { key: v, matched: v !== null && this.known.has(v), overridden: true, raw: s };
    }
    if (s === '') return { key: null, matched: false, overridden: false, raw: s };
    if (this.known.has(s)) return { key: s, matched: true, overridden: false, raw: s };
    return { key: s, matched: false, overridden: false, raw: s };
  }
}

/** Fields that must never be read downstream. */
const FORBIDDEN = ['coo', 'coa', 'coo_id', 'coa_id'] as const;

export class InternalCodeAccessError extends Error {
  constructor(field: string) {
    super(
      `Forbidden access to UNHCR internal field "${field}". Use "${field}_iso" (see scripts/etl/lib/codes.ts, spec §3.1).`,
    );
    this.name = 'InternalCodeAccessError';
  }
}

/**
 * Return a copy of the row with internal code fields removed and replaced by throwing getters.
 * Also renames `coo_iso`/`coa_iso` → `coo_iso`/`coa_iso` (unchanged) for clarity.
 */
export function sanitizeRow<T extends Record<string, unknown>>(
  row: T,
): Omit<T, 'coo' | 'coa' | 'coo_id' | 'coa_id'> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if ((FORBIDDEN as readonly string[]).includes(k)) continue;
    out[k] = v;
  }
  for (const f of FORBIDDEN) {
    Object.defineProperty(out, f, {
      enumerable: false,
      configurable: false,
      get() {
        throw new InternalCodeAccessError(f);
      },
    });
  }
  return out as Omit<T, 'coo' | 'coa' | 'coo_id' | 'coa_id'>;
}

/** Convenience: sanitize a whole page of rows. */
export function sanitizeRows<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map(sanitizeRow);
}

/** Slugify a region name for URLs: "Latin America and the Caribbean" → "latin-america-and-the-caribbean" */
export function regionSlug(name: string | null | undefined): string {
  if (!name) return 'other';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
