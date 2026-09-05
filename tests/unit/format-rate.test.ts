import { describe, it, expect } from 'vitest';
import { fmtRate } from '../../src/lib/format';

/**
 * On this site "0" and "—" are load-bearing and distinct: zero is a reported zero, an em dash is
 * not reported. Rounding a real 0.0039 down to "0" borrowed the first meaning for a third case —
 * "a few people" — and told the reader nobody was there.
 */
describe('fmtRate', () => {
  it('keeps not-reported distinct from zero', () => {
    expect(fmtRate(null)).toBe('—');
    expect(fmtRate(undefined)).toBe('—');
    expect(fmtRate(Number.NaN)).toBe('—');
    expect(fmtRate(0)).toBe('0');
  });

  it('never prints a non-zero rate as zero', () => {
    expect(fmtRate(0.0039)).toBe('<0.01');
    expect(fmtRate(0.0000001)).toBe('<0.01');
    expect(fmtRate(0.009)).toBe('<0.01');
  });

  it('formats ordinary rates with the documented precision', () => {
    expect(fmtRate(0.01)).toBe('0.01');
    expect(fmtRate(9.999)).toBe('10');
    expect(fmtRate(10)).toBe('10');
    expect(fmtRate(12.34)).toBe('12.3');
    expect(fmtRate(100)).toBe('100');
    expect(fmtRate(357.14)).toBe('357');
  });

  it('applies the same rule to negative values', () => {
    expect(fmtRate(-0.0039)).toBe('>-0.01');
    expect(fmtRate(-12.34)).toBe('-12.3');
  });
});
