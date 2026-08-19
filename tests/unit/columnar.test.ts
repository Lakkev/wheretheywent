import { describe, it, expect } from 'vitest';
import { pack, unpack, packedAt, packedLength, MIN_RUN } from '../../src/lib/columnar';

function rnd(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe('columnar codec', () => {
  it('round-trips a mixed series and keeps null ≠ 0', () => {
    const s = [null, 0, 0, 0, 0, 0, 5, null, null, null, null, 12, 0, 0, 0, 7, null];
    const p = pack(s);
    expect(unpack(p)).toEqual(s);
    expect(p).toEqual([null, ['z', 5], 5, ['n', 4], 12, 0, 0, 0, 7, null]);
  });
  it('does not compress runs shorter than MIN_RUN', () => {
    const s = Array(MIN_RUN - 1).fill(0);
    expect(pack(s)).toEqual(s);
    const n = Array(MIN_RUN - 1).fill(null);
    expect(pack(n)).toEqual(n);
  });
  it('compresses exactly MIN_RUN', () => {
    expect(pack(Array(MIN_RUN).fill(0))).toEqual([['z', MIN_RUN]]);
    expect(pack(Array(MIN_RUN).fill(null))).toEqual([['n', MIN_RUN]]);
  });
  it('zero and null runs never merge', () => {
    const s = [0, 0, 0, 0, null, null, null, null, 0, 0, 0, 0];
    expect(pack(s)).toEqual([
      ['z', 4],
      ['n', 4],
      ['z', 4],
    ]);
    expect(unpack(pack(s))).toEqual(s);
  });
  it('fuzz round-trip (1000 random series)', () => {
    const r = rnd(42);
    for (let t = 0; t < 1000; t++) {
      const len = Math.floor(r() * 80);
      const s: (number | null)[] = [];
      for (let i = 0; i < len; i++) {
        const x = r();
        s.push(x < 0.3 ? null : x < 0.6 ? 0 : Math.floor(r() * 1e7));
      }
      const p = pack(s);
      expect(unpack(p)).toEqual(s);
      expect(packedLength(p)).toBe(s.length);
      for (let i = 0; i < s.length; i++) expect(packedAt(p, i)).toBe(s[i]);
    }
  });
  it('empty series', () => {
    expect(pack([])).toEqual([]);
    expect(unpack([])).toEqual([]);
  });
  it('packed JSON is valid and smaller for long zero runs', () => {
    const s = Array(75).fill(0);
    expect(JSON.stringify(pack(s)).length).toBeLessThan(JSON.stringify(s).length);
  });
});
