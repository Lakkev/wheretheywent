/**
 * Build-time helpers for story pages. Every number shown in a story is computed here from the
 * published data files — never hard-coded — so stories stay true to the current snapshot.
 */
import { unpack } from '../../../lib/columnar';
import { METRIC_IDS, type CountryFile, type MetricId, type ViewId } from '../../../lib/types';

export function metricAt(
  file: CountryFile,
  view: ViewId,
  metric: MetricId,
  year: number,
): number | null {
  const yi = file.years.indexOf(year);
  if (yi < 0) return null;
  const mi = METRIC_IDS.indexOf(metric);
  return unpack(file[view].v[mi] ?? [])[yi] ?? null;
}

/** Highest value of a series and the year it occurred (null when never reported). */
export function peak(
  file: CountryFile,
  view: ViewId,
  metric: MetricId,
): { year: number; value: number } | null {
  const mi = METRIC_IDS.indexOf(metric);
  const series = unpack(file[view].v[mi] ?? []);
  let best: { year: number; value: number } | null = null;
  file.years.forEach((y, i) => {
    const v = series[i];
    if (v !== null && v !== undefined && (best === null || v > best.value)) {
      best = { year: y, value: v };
    }
  });
  return best;
}

/** First year a series was reported non-null. */
export function firstReported(
  file: CountryFile,
  view: ViewId,
  metric: MetricId,
): { year: number; value: number } | null {
  const mi = METRIC_IDS.indexOf(metric);
  const series = unpack(file[view].v[mi] ?? []);
  for (let i = 0; i < file.years.length; i++) {
    const v = series[i];
    if (v !== null && v !== undefined) return { year: file.years[i]!, value: v };
  }
  return null;
}

/** First year a series exceeds a threshold (default: first non-zero). */
export function firstAbove(
  file: CountryFile,
  view: ViewId,
  metric: MetricId,
  threshold = 0,
): { year: number; value: number } | null {
  const mi = METRIC_IDS.indexOf(metric);
  const series = unpack(file[view].v[mi] ?? []);
  for (let i = 0; i < file.years.length; i++) {
    const v = series[i];
    if (v !== null && v !== undefined && v > threshold) return { year: file.years[i]!, value: v };
  }
  return null;
}

export function latestReported(
  file: CountryFile,
  view: ViewId,
  metric: MetricId,
): { year: number; value: number } | null {
  const mi = METRIC_IDS.indexOf(metric);
  const series = unpack(file[view].v[mi] ?? []);
  for (let i = file.years.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v !== null && v !== undefined) return { year: file.years[i]!, value: v };
  }
  return null;
}
