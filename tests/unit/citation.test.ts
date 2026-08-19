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
  });
  it('cite-this-page matches the spec template', () => {
    expect(c.page).toBe(
      'Where They Went. "Syria — internally displaced persons, 1951–2025." Data: UNHCR Refugee Population Statistics Database (data as of December 31, 2025; retrieved August 19, 2026). https://example.org/country/SYR?y=2016&m=idps [accessed August 19, 2026].',
    );
  });
  it('all four formats contain UNHCR, the as-of date and the permalink', () => {
    for (const s of [c.apa, c.chicago, c.bibtex, c.page]) {
      expect(s).toContain('UNHCR');
      expect(s).toContain('2025');
      expect(s).toContain('https://example.org/country/SYR?y=2016&m=idps');
    }
  });
  it('bibtex is well-formed and escapes special chars', () => {
    expect(c.bibtex.startsWith('@misc{wheretheywent-')).toBe(true);
    expect(c.bibtex).toContain('urldate = {2026-08-19}');
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
