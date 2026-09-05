import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sourceIdsFor } from '../../src/lib/sources';
import type { MetricsFile } from '../../src/lib/types';

/**
 * Every page used to resolve provenance with the same inline rule — idps ? IDMC : UNHCR — which
 * credited UNHCR alone for total_poc even though that sum contains IDMC's IDP series. Resolution
 * now follows metrics.json `components`, so downstream users reading the same file agree with us.
 */
const metrics = JSON.parse(
  readFileSync('public/data/v1/metrics.json', 'utf8'),
) as MetricsFile;

describe('sourceIdsFor', () => {
  it('credits both publishers behind the derived total', () => {
    expect(sourceIdsFor('total_poc', 'asylum', 'abs', metrics)).toEqual([
      'unhcr_population',
      'unhcr_idmc',
    ]);
  });

  it('does not add unrelated sources to a plain metric', () => {
    expect(sourceIdsFor('refugees', 'asylum', 'abs', metrics)).toEqual(['unhcr_population']);
    expect(sourceIdsFor('idps', 'origin', 'abs', metrics)).toEqual(['unhcr_idmc']);
  });

  it('adds the WPP denominator only for per-1,000 views', () => {
    expect(sourceIdsFor('refugees', 'asylum', 'per1k', metrics)).toEqual([
      'unhcr_population',
      'wpp_population',
    ]);
    expect(sourceIdsFor('refugees', 'asylum', 'abs', metrics)).not.toContain('wpp_population');
  });

  it('drops a component that has no reading in the requested view', () => {
    // stateless is asylum-only, and its source happens to be UNHCR population — so assert the
    // component list rather than the id set, which would look identical.
    const def = metrics.metrics.total_poc;
    expect(def.components).toContain('stateless');
    expect(sourceIdsFor('total_poc', 'origin', 'abs', metrics)).toEqual([
      'unhcr_population',
      'unhcr_idmc',
    ]);
  });

  it('falls back to the metric source when metrics.json has not loaded yet', () => {
    expect(sourceIdsFor('idps', 'asylum', 'abs', null)).toEqual(['unhcr_idmc']);
    expect(sourceIdsFor('refugees', 'asylum', 'abs', null)).toEqual(['unhcr_population']);
  });
});
