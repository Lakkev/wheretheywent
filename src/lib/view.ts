/**
 * Derive the "current view" — the rows/colours every panel shares for (year, metric, view, norm,
 * scale, region filter, min threshold). Pure; called from a $derived in MapApp.
 */
import type { StockStore } from './data';
import type { CountryMeta, AnyMetricId, ViewId } from './types';
import { computeBreaks, colorFor, type Breaks, type ScaleKind } from './colors';
import type { Norm } from './url';

export interface ViewRow {
  iso3: string;
  meta: CountryMeta;
  /** absolute persons (null = not reported) */
  abs: number | null;
  /** per 1,000 residents (null when no population) */
  per1k: number | null;
  /** the value used for colouring/ranking under the current normalisation */
  value: number | null;
  color: string;
  rank: number; // 1-based among rows with value > 0, else 0
  /** passes region + min filters */
  visible: boolean;
  drawable: boolean;
}

export interface ViewResult {
  rows: ViewRow[];
  byIso: Map<string, ViewRow>;
  breaks: Breaks;
  /** global total (persons) for the metric/year in this view, as published (sum of all entities) */
  total: number | null;
  /** sum of visible drawable rows (abs) */
  mappedTotal: number | null;
  /** rows with data that cannot be drawn on the map */
  unmappable: ViewRow[];
  yearAvailable: boolean;
}

export interface ViewParams {
  year: number;
  metric: AnyMetricId;
  view: ViewId;
  norm: Norm;
  scale: ScaleKind;
  regions: string[];
  min: number;
  /**
   * When provided, class breaks are computed over ALL these years (not just the current one),
   * so colours stay comparable while scrubbing/playing the timeline (fixed classing).
   */
  breakYears?: number[];
}

export function computeView(
  p: ViewParams,
  stock: StockStore,
  countries: Iterable<CountryMeta>,
): ViewResult {
  const rows: ViewRow[] = [];
  const regionSet = new Set(p.regions);
  const yearAvailable = stock.hasYear(p.year);
  for (const meta of countries) {
    const abs = yearAvailable ? stock.value(p.view, meta.iso3, p.metric, p.year) : null;
    const per1k = yearAvailable ? stock.per1k(p.view, meta.iso3, p.metric, p.year) : null;
    const value = p.norm === 'per1k' ? per1k : abs;
    const inRegion = regionSet.size === 0 || regionSet.has(meta.region_slug);
    const passesMin = p.min <= 0 || (abs !== null && abs >= p.min);
    rows.push({
      iso3: meta.iso3,
      meta,
      abs,
      per1k,
      value,
      color: '',
      rank: 0,
      visible: inRegion && passesMin,
      drawable: meta.in_geo,
    });
  }
  // breaks over visible rows — across the whole year range when breakYears is given (#audit-1)
  const breakValues: (number | null)[] = [];
  if (p.breakYears && p.breakYears.length > 1) {
    for (const r of rows) {
      if (!r.visible) continue;
      for (const y of p.breakYears) {
        breakValues.push(
          p.norm === 'per1k'
            ? stock.per1k(p.view, r.iso3, p.metric, y)
            : stock.value(p.view, r.iso3, p.metric, y),
        );
      }
    }
  } else {
    for (const r of rows) if (r.visible) breakValues.push(r.value);
  }
  const breaks = computeBreaks(breakValues, p.scale);
  // colours + ranks
  const ranked = rows
    .filter((r) => r.visible && r.value !== null && r.value > 0)
    .sort((a, b) => b.value! - a.value! || a.iso3.localeCompare(b.iso3));
  ranked.forEach((r, i) => (r.rank = i + 1));
  let mappedTotal: number | null = null;
  const unmappable: ViewRow[] = [];
  for (const r of rows) {
    r.color = r.visible ? colorFor(r.value, breaks) : colorFor(null, breaks);
    if (r.abs !== null) {
      if (r.drawable) {
        if (r.visible) mappedTotal = (mappedTotal ?? 0) + r.abs;
      } else unmappable.push(r);
    }
  }
  const byIso = new Map(rows.map((r) => [r.iso3, r]));
  return {
    rows,
    byIso,
    breaks,
    total: yearAvailable ? stock.total(p.view, p.metric, p.year) : null,
    mappedTotal,
    unmappable: unmappable.sort((a, b) => (b.abs ?? 0) - (a.abs ?? 0)),
    yearAvailable,
  };
}

/** Top-N rows for the rank list. */
export function topRows(v: ViewResult, n = 20): ViewRow[] {
  return v.rows.filter((r) => r.rank > 0 && r.rank <= n).sort((a, b) => a.rank - b.rank);
}
