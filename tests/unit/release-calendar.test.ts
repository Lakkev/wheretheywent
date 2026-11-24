import { describe, expect, it } from 'vitest';
import {
  footnotesLookMidYear,
  latestPossibleYearEnd,
} from '../../scripts/etl/lib/release-calendar.ts';

describe('latestPossibleYearEnd', () => {
  it('never allows the current year', () => {
    expect(latestPossibleYearEnd(new Date('2026-11-24T00:00:00Z'))).toBe(2025);
    expect(latestPossibleYearEnd(new Date('2026-12-31T23:59:59Z'))).toBe(2025);
  });
  it('allows the previous year only from June (Global Trends release)', () => {
    expect(latestPossibleYearEnd(new Date('2027-05-31T23:59:59Z'))).toBe(2025);
    expect(latestPossibleYearEnd(new Date('2027-06-01T00:00:00Z'))).toBe(2026);
    expect(latestPossibleYearEnd(new Date('2027-01-15T00:00:00Z'))).toBe(2025);
  });
});

describe('footnotesLookMidYear', () => {
  it('flags the real mid-2026 wording', () => {
    const r = footnotesLookMidYear(
      [
        'At mid-2026, 889,600 registered and individually recorded Syrians were included in UNHCR’s official statistics.',
        'Figure as at mid-2026, based on government estimates.',
      ],
      2026,
    );
    expect(r).toEqual({ mid: 2, end: 0, midYear: true });
  });
  it('accepts a year-end release that mentions an earlier mid-year figure', () => {
    const r = footnotesLookMidYear(
      [
        'The figure at end-2025 includes new arrivals.',
        'Revised since mid-2025.',
        'Year-end estimate from the government.',
      ],
      2025,
    );
    expect(r.midYear).toBe(false);
  });
  it('does not match another year or a word fragment', () => {
    expect(footnotesLookMidYear(['As at mid-2025.', 'midstream 2026'], 2026).mid).toBe(0);
  });
  it('treats no evidence as not mid-year (the calendar cap still applies)', () => {
    expect(footnotesLookMidYear([], 2025).midYear).toBe(false);
  });
});
