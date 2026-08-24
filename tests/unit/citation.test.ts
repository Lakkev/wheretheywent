import { describe, it, expect } from 'vitest';
import { buildCitations, viewTitle } from '../../src/lib/citation';
import type { SourceEntry } from '../../src/lib/types';

const unhcr: SourceEntry = {
  publisher: 'UNHCR',
  title: 'Refugee Population Statistics Database — population figures',
  landing_page: 'https://www.unhcr.org/refugee-statistics/',
  license: { id: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  attribution: 'UNHCR Refugee Population Statistics Database',
  data_as_of: '2025-12-31',
  period_type: 'year-end',
  retrieved_at: '2026-08-19T03:17:02Z',
  coverage: { year_min: 1951, year_max: 2025 },
  content_hash: 'sha256:x',
  status: 'ok',
  caveats: [],
};

describe('citations', () => {
  const c = buildCitations({
    locale: 'en',
    title: 'Syria — internally displaced persons, 1951–2025',
    url: 'https://example.org/country/SYR?y=2016&m=idps',
    sources: [unhcr],
    accessed: '2026-08-19',
    version: 'b0f6d319',
  });
  it('cite-this-page matches the spec template (+ snapshot suffix)', () => {
    expect(c.page).toBe(
      'Where They Went. "Syria — internally displaced persons, 1951–2025." Data: UNHCR Refugee Population Statistics Database (data as of 31 December 2025; retrieved 19 August 2026). https://example.org/country/SYR?y=2016&m=idps [accessed 19 August 2026]. Snapshot b0f6d319.',
    );
  });
  it('publication year is the data year, not the access year (#4)', () => {
    expect(c.apa).toContain('(2025).');
    expect(c.apa).not.toContain('(2026).');
    expect(c.chicago).toContain('. 2025. ');
  });
  it('APA carries Version and Retrieved-from (#5)', () => {
    expect(c.apa).toContain('(Version b0f6d319)');
    expect(c.apa).toContain('Retrieved 19 August 2026, from https://example.org/country/SYR?y=2016&m=idps');
  });
  it('all four formats contain UNHCR, the as-of date and the permalink', () => {
    for (const s of [c.apa, c.chicago, c.bibtex, c.page]) {
      expect(s).toContain('UNHCR');
      expect(s).toContain('2025');
      expect(s).toContain('https://example.org/country/SYR?y=2016&m=idps');
    }
  });
  it('bibtex is a @dataset with version and collision-proof key (#6)', () => {
    expect(c.bibtex.startsWith('@dataset{wheretheywent-')).toBe(true);
    expect(c.bibtex).toContain('version = {b0f6d319}');
    expect(c.bibtex).toContain('year = {2025}');
    expect(c.bibtex).toContain('urldate = {2026-08-19}');
    // two titles sharing a 3-token prefix must not share a key
    const a = buildCitations({ locale: 'en', title: 'Syria — internally displaced persons, 2016', url: 'https://x/a', sources: [unhcr], accessed: '2026-01-01' });
    const b = buildCitations({ locale: 'en', title: 'Syria — internally displaced persons, 2024', url: 'https://x/b', sources: [unhcr], accessed: '2026-01-01' });
    expect(a.bibtex.split(',')[0]).not.toBe(b.bibtex.split(',')[0]);
    const amp = buildCitations({
      locale: 'en',
      title: 'A & B 100%',
      url: 'https://x',
      sources: [unhcr],
      accessed: '2026-01-01',
    });
    expect(amp.bibtex).toContain('A \\& B 100\\%');
  });
  it('zh-Hant template', () => {
    const z = buildCitations({
      locale: 'zh-Hant',
      title: '敘利亞 — 境內流離失所者',
      url: 'https://x/y',
      sources: [unhcr],
      accessed: '2026-08-19',
    });
    expect(z.page).toContain('他們去了哪裡');
    expect(z.page).toContain('資料截至');
    expect(z.page).toContain('https://x/y');
  });
  it('viewTitle', () => {
    expect(viewTitle({ metricLabel: 'Refugees', viewLabel: 'Who hosts them', year: 2024 })).toBe(
      'Refugees — who hosts them, 2024',
    );
    expect(
      viewTitle({
        metricLabel: 'Refugees',
        viewLabel: 'Who hosts them',
        year: 2024,
        country: 'Syria',
        norm: 'per1k',
        normLabel: 'Per 1,000 residents',
      }),
    ).toBe('Syria — refugees, per 1,000 residents, 2024');
  });
});
