import { describe, it, expect } from 'vitest';
import {
  METRIC_IDS,
  TOTAL_POC_COMPONENTS,
  FORCED_DISPLACEMENT_COMPONENTS,
} from '../../src/lib/types';

/**
 * These two lists are load-bearing for a public claim: the home page says "1 in every N people
 * on Earth is forcibly displaced" in seven languages. Until 2026-09-05 that sentence was computed
 * from total_poc, which also carries stateless persons (~4.5 M) and others of concern (~3.0 M) —
 * neither of whom is necessarily displaced — so the figure ran about 6% high.
 *
 * The lists are therefore pinned here rather than merely derived. Widening either one has to be a
 * deliberate edit to this test, with the wording and the methodology page changed alongside it.
 */
describe('displacement component lists', () => {
  it('pins the forced-displacement numerator', () => {
    expect(FORCED_DISPLACEMENT_COMPONENTS).toEqual(['refugees', 'asylum_seekers', 'idps', 'oip']);
  });

  it('pins the people-of-concern components', () => {
    expect(TOTAL_POC_COMPONENTS).toEqual([
      'refugees',
      'asylum_seekers',
      'idps',
      'stateless',
      'ooc',
      'oip',
    ]);
  });

  it('never counts a non-displacement category as displacement', () => {
    for (const banned of ['stateless', 'ooc', 'hst', 'returned_refugees', 'returned_idps']) {
      expect(FORCED_DISPLACEMENT_COMPONENTS as readonly string[]).not.toContain(banned);
    }
  });

  it('keeps forced displacement a strict subset of people of concern', () => {
    for (const m of FORCED_DISPLACEMENT_COMPONENTS) {
      expect(TOTAL_POC_COMPONENTS as readonly string[]).toContain(m);
    }
    expect(FORCED_DISPLACEMENT_COMPONENTS.length).toBeLessThan(TOTAL_POC_COMPONENTS.length);
  });

  it('only names metrics that are actually published', () => {
    for (const m of [...TOTAL_POC_COMPONENTS, ...FORCED_DISPLACEMENT_COMPONENTS]) {
      expect(METRIC_IDS as readonly string[]).toContain(m);
    }
  });
});
