/**
 * Which UNHCR year label may be published as a year-end (31 December) figure.
 *
 * UNHCR reuses the same `year` label for two different things:
 *   - mid-year figures for year Y (as at 30 June Y) appear in the API around October–November of Y
 *     (Mid-Year Trends), and
 *   - year-end figures for year Y (as at 31 December Y) replace them in mid-June of Y+1
 *     (Global Trends).
 * Every stock on this site is labelled year-end, so a mid-year release must never become the
 * latest year. On 2026-11-17 the API began returning mid-2026 figures as `year=2026`, and the
 * site published them as "data as of 2026-12-31" for a week. These two checks stop that:
 *   1. calendar: year-end figures for Y cannot exist before June of Y+1;
 *   2. footnotes: around the June switch, UNHCR's footnotes for a mid-year release say
 *      "mid-Y" and never "end-Y" (checked on 2023–2026: final years have end ≥ mid, mid-2026
 *      had 31 mid / 0 end).
 */

/** Month (1-based) of the earliest possible year-end release for the previous year. */
export const YEAR_END_RELEASE_MONTH = 6;

/** The most recent year whose year-end figures could have been published by `now` (UTC). */
export function latestPossibleYearEnd(now: Date): number {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() + 1 >= YEAR_END_RELEASE_MONTH ? y - 1 : y - 2;
}

/** Classify a year's UNHCR footnotes: does the text describe a mid-year release? */
export function footnotesLookMidYear(
  texts: readonly string[],
  year: number,
): { mid: number; end: number; midYear: boolean } {
  const midRe = new RegExp(`\\bmid-?\\s?${year}\\b|\\bmid-year\\b`, 'i');
  const endRe = new RegExp(`\\bend-?\\s?${year}\\b|\\byear-end\\b|\\bend of ${year}\\b`, 'i');
  let mid = 0;
  let end = 0;
  for (const t of texts) {
    if (midRe.test(t)) mid++;
    if (endRe.test(t)) end++;
  }
  return { mid, end, midYear: mid > end };
}
