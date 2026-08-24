import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '../../src/i18n/ui';
import type { MetricsFile, SourcesFile } from '../../src/lib/types';

/**
 * PRINCIPLE GUARD: data-level strings (metric definitions/caveats, source caveats) are the
 * academic core and are NEVER tiered to English — every non-English UI locale must have a
 * real translation in the PUBLISHED data files. This test reads the promoted artifacts, so it
 * fails if the ETL and the locale registry ever drift apart.
 */
const ROOT = join(process.cwd(), 'public', 'data', 'v1');
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as T;
const langs = LOCALES.filter((l) => l !== 'en');
const published = existsSync(join(ROOT, 'metrics.json'));

describe.skipIf(!published)('published data-level i18n completeness', () => {
  it('every metric has definition + caveats in every non-English locale', () => {
    const { metrics } = read<MetricsFile>('metrics.json');
    for (const m of Object.values(metrics)) {
      for (const l of langs) {
        expect(m.definition_i18n?.[l], `${m.id} definition [${l}]`).toBeTruthy();
        expect(m.caveats_i18n?.[l], `${m.id} caveats [${l}]`).toBeDefined();
      }
    }
  });
  it('every source has caveats in every non-English locale', () => {
    const sources = read<SourcesFile>('sources.json');
    for (const [id, s] of Object.entries(sources)) {
      for (const l of langs) {
        expect(s.caveats_i18n?.[l], `${id} caveats [${l}]`).toBeDefined();
      }
    }
  });
});
