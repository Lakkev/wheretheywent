import { describe, it, expect } from 'vitest';
import {
  CodeRegistry,
  sanitizeRow,
  KNOWN_COLLISIONS,
  ISO_OVERRIDES,
  InternalCodeAccessError,
  regionSlug,
  PSEUDO,
} from '../../scripts/etl/lib/codes';

const reg = new CodeRegistry(['AUT', 'AUS', 'EGY', 'ARE', 'MTQ', 'MAR', 'DEU', 'SYR', 'TUR']);

describe('★ UNHCR internal-code collisions (golden cases, spec §3.1)', () => {
  for (const k of KNOWN_COLLISIONS) {
    it(`row {coa:"${k.internal}", coa_iso:"${k.iso}"} resolves to ${k.iso} (${k.name}), never ${k.internal} (${k.collidesWith})`, () => {
      const raw = {
        year: 2024,
        coa: k.internal,
        coa_iso: k.iso,
        coo: '-',
        coo_iso: '-',
        refugees: 1,
      };
      const row = sanitizeRow(raw);
      // the only legitimate path:
      const n = reg.normalize(row.coa_iso);
      expect(n.key).toBe(k.iso);
      expect(n.matched).toBe(true);
      // the forbidden path throws loudly
      expect(() => (row as Record<string, unknown>)['coa']).toThrow(InternalCodeAccessError);
      // and the internal code would have mis-keyed if used
      expect(k.internal).not.toBe(k.iso);
      expect(reg.has(k.internal)).toBe(true); // it IS a real ISO3 of another country — hence the danger
    });
  }
});

describe('sanitizeRow', () => {
  it('removes coo/coa/coo_id/coa_id and installs throwing getters', () => {
    const row = sanitizeRow({
      coo: 'GFR',
      coa: 'AUS',
      coo_id: 1,
      coa_id: 2,
      coo_iso: 'DEU',
      coa_iso: 'AUT',
      refugees: '0',
    });
    expect(Object.keys(row)).toEqual(['coo_iso', 'coa_iso', 'refugees']);
    expect(() => (row as Record<string, unknown>)['coo']).toThrow(/coo_iso/);
    expect(() => (row as Record<string, unknown>)['coo_id']).toThrow(InternalCodeAccessError);
    expect(JSON.parse(JSON.stringify(row))).toEqual({
      coo_iso: 'DEU',
      coa_iso: 'AUT',
      refugees: '0',
    });
  });
});

describe('CodeRegistry.normalize', () => {
  it('maps aggregates and blanks to null (drop row)', () => {
    expect(reg.normalize('-').key).toBeNull();
    expect(reg.normalize('').key).toBeNull();
    expect(reg.normalize(' ').key).toBeNull();
    expect(reg.normalize(undefined).key).toBeNull();
  });
  it('applies overrides for non-ISO entities', () => {
    expect(reg.normalize('XXA')).toMatchObject({
      key: PSEUDO.STATELESS,
      matched: true,
      overridden: true,
    });
    expect(reg.normalize('UNK')).toMatchObject({ key: PSEUDO.UNKNOWN, matched: true });
    expect(reg.normalize('TIB')).toMatchObject({ key: PSEUDO.TIBETAN, matched: true });
    expect(reg.normalize('CUR')).toMatchObject({ key: 'CUW', matched: true });
    expect(reg.normalize('AB9')).toMatchObject({ key: PSEUDO.ABYEI, matched: true });
  });
  it('flags unknown codes as unmatched but keeps the raw value', () => {
    expect(reg.normalize('ZZZ')).toEqual({
      key: 'ZZZ',
      matched: false,
      overridden: false,
      raw: 'ZZZ',
    });
  });
  it('uppercases and trims', () => {
    expect(reg.normalize(' syr ')).toMatchObject({ key: 'SYR', matched: true });
  });
  it('every override target is either null or a known key', () => {
    for (const v of Object.values(ISO_OVERRIDES)) if (v) expect(reg.has(v)).toBe(true);
  });
});

describe('regionSlug', () => {
  it('slugifies', () => {
    expect(regionSlug('Latin America and the Caribbean')).toBe('latin-america-and-the-caribbean');
    expect(regionSlug('Northern America')).toBe('northern-america');
    expect(regionSlug(null)).toBe('other');
  });
});
