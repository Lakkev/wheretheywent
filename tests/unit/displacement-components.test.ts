import { describe, it, expect } from 'vitest';
import {
  METRIC_IDS,
  METRIC_VIEWS,
  TOTAL_POC_COMPONENTS,
  FORCED_DISPLACEMENT_COMPONENTS,
  pocComponentsFor,
  metricInView,
} from '../../src/lib/types';
import { decodeState } from '../../src/lib/url';

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

/**
 * Until 2026-09-05 MetricDef.views had no consumer anywhere in the app, so ?m=stateless&v=origin
 * rendered residence figures under an origin heading — the same numbers, a different claim.
 */
describe('metric availability by view', () => {
  it('marks the residence-only metrics as asylum-only', () => {
    expect(METRIC_VIEWS.stateless).toEqual(['asylum']);
    expect(METRIC_VIEWS.hst).toEqual(['asylum']);
  });

  it('drops residence-only components from an origin total', () => {
    expect(pocComponentsFor('asylum')).toEqual(TOTAL_POC_COMPONENTS);
    expect(pocComponentsFor('origin')).not.toContain('stateless');
    expect(pocComponentsFor('origin')).toContain('refugees');
  });

  it('answers metricInView for plain and derived metrics', () => {
    expect(metricInView('stateless', 'asylum')).toBe(true);
    expect(metricInView('stateless', 'origin')).toBe(false);
    expect(metricInView('refugees', 'origin')).toBe(true);
    expect(metricInView('total_poc', 'origin')).toBe(true);
  });
});

describe('URL normalisation of metric + view', () => {
  const ctx = { yearMin: 1951, yearMax: 2025 };

  it('rejects a metric that has no reading in the requested view', () => {
    const { state, errors } = decodeState('?m=stateless&v=origin', ctx);
    expect(state.m).toBe('refugees');
    expect(state.v).toBe('origin');
    expect(errors).toContain('m');
  });

  it('keeps the same metric where the view supports it', () => {
    const { state, errors } = decodeState('?m=stateless&v=asylum', ctx);
    expect(state.m).toBe('stateless');
    expect(errors).not.toContain('m');
  });
});
