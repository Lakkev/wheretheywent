import { describe, it, expect } from 'vitest';
import {
  computeBreaks,
  classify,
  colorFor,
  legendEntries,
  NODATA_COLOR,
  ZERO_COLOR,
  RAMP,
  K,
  niceNumber,
  isDark,
} from '../../src/lib/colors';

describe('colors', () => {
  it('null → NODATA grey, 0 → lightest, and they differ', () => {
    const b = computeBreaks([1, 10, 100, 1000], 'quant');
    expect(colorFor(null, b)).toBe(NODATA_COLOR);
    expect(colorFor(0, b)).toBe(ZERO_COLOR);
    expect(NODATA_COLOR).not.toBe(ZERO_COLOR);
    expect(classify(null, b)).toBe(-2);
    expect(classify(0, b)).toBe(-1);
  });
  it('quantile breaks are monotonic and classify into K classes', () => {
    const vals = Array.from({ length: 200 }, (_, i) => (i + 1) * 37);
    const b = computeBreaks(vals, 'quant');
    expect(b.thresholds.length).toBe(K - 1);
    for (let i = 1; i < b.thresholds.length; i++)
      expect(b.thresholds[i]! >= b.thresholds[i - 1]!).toBe(true);
    expect(classify(37, b)).toBe(0);
    expect(classify(200 * 37, b)).toBe(K - 1);
    const counts = new Array(K).fill(0);
    for (const v of vals) counts[classify(v, b)]++;
    // roughly equal bins
    for (const c of counts) expect(Math.abs(c - 200 / K)).toBeLessThan(10);
  });
  it('log breaks span orders of magnitude', () => {
    const b = computeBreaks([5, 50, 500, 5000, 50000, 500000, 5e6], 'log');
    expect(b.thresholds[0]!).toBeLessThan(b.thresholds[K - 2]!);
    expect(classify(5, b)).toBe(0);
    expect(classify(5e6, b)).toBe(K - 1);
  });
  it('linear breaks', () => {
    const b = computeBreaks([0, 100, 200, 700], 'lin');
    expect(b.min).toBe(100);
    expect(b.max).toBe(700);
    expect(classify(700, b)).toBe(K - 1);
  });
  it('handles empty / all-null / all-zero', () => {
    const b = computeBreaks([null, 0, undefined], 'quant');
    expect(b.n).toBe(0);
    expect(colorFor(0, b)).toBe(ZERO_COLOR);
    expect(colorFor(null, b)).toBe(NODATA_COLOR);
    expect(legendEntries(b)).toEqual([]);
  });
  it('legend entries cover the ramp', () => {
    const b = computeBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'quant');
    const e = legendEntries(b);
    expect(e.length).toBe(K);
    expect(e.map((x) => x.color)).toEqual([...RAMP]);
    expect(e[K - 1]!.to).toBeNull();
  });
  it('ramp is warm earth (sand→soil), never blue, and darkens monotonically', () => {
    // Owner directive 2026-08-25 (supersedes spec D6 blues): the palette is desert & soil.
    let prevLum = Infinity;
    for (const hex of RAMP) {
      const r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
      expect(r).toBeGreaterThanOrEqual(b); // red/earth dominates blue
      expect(g).toBeGreaterThanOrEqual(b); // never a purple/blue cast
      // ochre/brown keeps a visible green component; pure alarm-red ramps (whose dark
      // steps collapse toward g≈0.1·r, e.g. ColorBrewer Reds) must fail the build
      expect(g).toBeGreaterThanOrEqual(0.3 * r);
      // sequential ramps must darken step by step or classes become unreadable
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(lum).toBeLessThan(prevLum);
      prevLum = lum;
    }
  });
  it('niceNumber', () => {
    expect(niceNumber(1234)).toBe(1000);
    expect(niceNumber(1700)).toBe(2000);
    expect(niceNumber(4200)).toBe(5000);
    expect(niceNumber(8500)).toBe(10000);
  });
  it('isDark', () => {
    expect(isDark('#08306b')).toBe(true);
    expect(isDark('#deebf7')).toBe(false);
  });
});
