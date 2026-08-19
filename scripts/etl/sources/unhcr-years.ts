/**
 * Year upper bound auto-detection (§7.3). Never hard-code the latest year.
 *   1. GET /years/ → max Y
 *   2. GET /population/?year=Y&coa_all=true&limit=1 → maxPages > 0 ?
 *   3. else Y-1, repeat (at most 3 steps back)
 */
import { fetchJson } from '../lib/http.ts';
import { unhcrUrl, countRows } from '../lib/paginate.ts';
import { log } from '../lib/log.ts';

export async function detectMaxYear(): Promise<{ maxYear: number; listedMax: number }> {
  const page = await fetchJson<{ items: { year: number | string }[] }>(
    unhcrUrl('years', { limit: 500 }),
  );
  const years = (page.items ?? []).map((i) => Number(i.year)).filter((y) => Number.isInteger(y));
  if (!years.length) throw new Error('years: empty /years/ response');
  const listedMax = Math.max(...years);
  let y = listedMax;
  for (let step = 0; step < 4; step++) {
    const n = await countRows('population', { year: y, coa_all: true, cf_type: 'ISO' });
    if (n > 0) {
      log.info(
        `years: listed max ${listedMax}, latest year with population data = ${y} (${n} rows)`,
      );
      return { maxYear: y, listedMax };
    }
    log.warn(`years: ${y} has no population rows yet — stepping back`);
    y--;
  }
  throw new Error('years: could not find a year with population data');
}
