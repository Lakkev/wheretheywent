/**
 * Year upper bound auto-detection (§7.3). Never hard-code the latest year.
 *   1. GET /years/ → max listed year
 *   2. cap it at the latest year whose YEAR-END figures could exist yet (release-calendar.ts):
 *      UNHCR publishes mid-year figures under the same year label months before year-end ones
 *   3. GET /population/?year=Y&coa_all=true&limit=1 → rows > 0 ?
 *   4. GET /footnotes/?year=Y → reject Y if its footnotes describe a mid-year release
 *   5. else Y-1, repeat (at most 3 steps back)
 */
import { fetchJson } from '../lib/http.ts';
import { unhcrUrl, countRows, type UnhcrPage } from '../lib/paginate.ts';
import { log } from '../lib/log.ts';
import { footnotesLookMidYear, latestPossibleYearEnd } from '../lib/release-calendar.ts';

async function footnoteTexts(year: number): Promise<string[]> {
  const texts: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetchJson<UnhcrPage<{ footnote?: unknown }>>(
      unhcrUrl('footnotes', { year, limit: 1000, page }),
    );
    for (const i of r.items ?? []) texts.push(String(i.footnote ?? ''));
    if (page >= (r.maxPages ?? 1)) break;
  }
  return texts;
}

export async function detectMaxYear(
  now: Date = new Date(),
): Promise<{ maxYear: number; listedMax: number }> {
  const page = await fetchJson<{ items: { year: number | string }[] }>(
    unhcrUrl('years', { limit: 500 }),
  );
  const years = (page.items ?? []).map((i) => Number(i.year)).filter((y) => Number.isInteger(y));
  if (!years.length) throw new Error('years: empty /years/ response');
  const listedMax = Math.max(...years);
  const ceiling = latestPossibleYearEnd(now);
  let y = Math.min(listedMax, ceiling);
  if (listedMax > ceiling)
    log.info(
      `years: UNHCR lists ${listedMax}, but year-end figures cannot exist yet beyond ${ceiling} — treating later years as mid-year releases`,
    );
  for (let step = 0; step < 4; step++) {
    const n = await countRows('population', { year: y, coa_all: true, cf_type: 'ISO' });
    if (n === 0) {
      log.warn(`years: ${y} has no population rows yet — stepping back`);
      y--;
      continue;
    }
    try {
      const fn = footnotesLookMidYear(await footnoteTexts(y), y);
      if (fn.midYear) {
        log.warn(
          `years: ${y} footnotes describe a mid-year release (mid ${fn.mid} / end ${fn.end}) — stepping back`,
        );
        y--;
        continue;
      }
    } catch (e) {
      // The calendar cap above still holds; the footnote check only sharpens the June switch.
      log.warn(`years: footnote check for ${y} failed (${String(e)}) — relying on the calendar cap`);
    }
    log.info(`years: listed max ${listedMax}, latest year-end year = ${y} (${n} rows)`);
    return { maxYear: y, listedMax };
  }
  throw new Error('years: could not find a year with year-end population data');
}
