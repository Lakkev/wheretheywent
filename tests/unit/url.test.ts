import { describe, it, expect } from 'vitest';
import {
  encodeState,
  decodeState,
  defaultState,
  normalizeState,
  diffKeys,
  type MapState,
} from '../../src/lib/url';

const ctx = {
  yearMin: 1951,
  yearMax: 2025,
  knownIso: new Set(['SYR', 'TUR', 'DEU', 'LBN', 'JOR']),
  knownRegions: new Set(['asia', 'europe', 'africa']),
};

describe('url codec', () => {
  it('default state encodes to empty string', () => {
    expect(encodeState(defaultState(ctx), ctx)).toBe('');
  });
  it('omits defaults, stable order, compact separators', () => {
    const s: MapState = {
      ...defaultState(ctx),
      y: 2016,
      m: 'idps',
      c: 'SYR',
      cmp: ['TUR', 'SYR'],
      map: { z: 3.5, lat: 34.8, lon: 38.99 },
    };
    expect(encodeState(s, ctx)).toBe('?y=2016&m=idps&c=SYR&cmp=SYR,TUR&map=3.5/34.8/38.99');
  });
  it('round-trips', () => {
    const s: MapState = {
      y: 1999,
      m: 'total_poc',
      v: 'origin',
      n: 'per1k',
      sc: 'log',
      c: 'LBN',
      cmp: ['DEU', 'LBN', 'TUR'],
      r: ['asia', 'europe'],
      min: 1000,
      map: { z: 2, lat: -10.5, lon: 120.25 },
      p: 'closed',
      t: true,
      tab: 'series',
      f: true,
    };
    const q = encodeState(s, ctx);
    const { state, errors } = decodeState(q, ctx);
    expect(errors).toEqual([]);
    expect(state).toEqual(s);
    expect(encodeState(state, ctx)).toBe(q);
  });
  it('same state ⇒ byte-identical URL regardless of input order', () => {
    const a: MapState = { ...defaultState(ctx), cmp: ['TUR', 'DEU'], r: ['europe', 'asia'] };
    const b: MapState = { ...defaultState(ctx), cmp: ['DEU', 'TUR'], r: ['asia', 'europe'] };
    expect(encodeState(a, ctx)).toBe(encodeState(b, ctx));
  });
  it('bad params fall back to defaults and are reported, never throw', () => {
    const { state, errors } = decodeState(
      '?y=abc&m=nope&v=x&n=y&sc=z&c=!!&min=-5&map=1/2&p=q&t=9&tab=w',
      ctx,
    );
    expect(state).toEqual(defaultState(ctx));
    expect(errors.sort()).toEqual(
      ['c', 'm', 'map', 'min', 'n', 'p', 'sc', 't', 'tab', 'v', 'y'].sort(),
    );
  });
  it('clamps year into range and reports', () => {
    expect(decodeState('?y=1900', ctx).state.y).toBe(2025);
    expect(decodeState('?y=1900', ctx).errors).toEqual(['y']);
    expect(decodeState('?y=2030', ctx).state.y).toBe(2025);
  });
  it('cmp: dedupe, sort, cap at 3, drop unknown, uppercase', () => {
    const { state, errors } = decodeState('?cmp=tur,SYR,tur,DEU,LBN,XXX', ctx);
    expect(state.cmp).toEqual(['DEU', 'LBN', 'SYR']);
    expect(errors).toContain('cmp');
  });
  it('c: unknown ISO dropped with error', () => {
    const r = decodeState('?c=ZZZ', ctx);
    expect(r.state.c).toBeNull();
    expect(r.errors).toEqual(['c']);
  });
  it('regions: lowercased, unknown dropped', () => {
    const r = decodeState('?r=Asia,mars', ctx);
    expect(r.state.r).toEqual(['asia']);
    expect(r.errors).toEqual(['r']);
  });
  it('map rounds to 2 decimals', () => {
    const s = normalizeState(
      { ...defaultState(ctx), map: { z: 3.14159, lat: 1.006, lon: -2.999 } },
      ctx,
    );
    expect(s.map).toEqual({ z: 3.14, lat: 1.01, lon: -3 });
    expect(encodeState(s, ctx)).toBe('?map=3.14/1.01/-3');
  });
  it('diffKeys', () => {
    const a = defaultState(ctx);
    expect(diffKeys(a, { ...a, y: 2000, cmp: ['SYR'] })).toEqual(['y', 'cmp']);
  });
  it('works without knownIso (pre-data) — codes pass through if well-formed', () => {
    const c2 = { yearMin: 1951, yearMax: 2025 };
    expect(decodeState('?c=syr&cmp=a,b', c2).state).toMatchObject({ c: 'SYR', cmp: [] });
    expect(decodeState('?c=SYR&cmp=TUR,DEU', c2).state).toMatchObject({
      c: 'SYR',
      cmp: ['DEU', 'TUR'],
    });
  });
});
