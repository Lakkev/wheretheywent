/** Shared Observable Plot helpers (client only). Plot is imported dynamically to keep it off the first screen. */
import type { CountryFile, AnyMetricId } from '../../lib/types';
import { METRIC_IDS } from '../../lib/types';
import { unpack } from '../../lib/columnar';

export type PlotModule = typeof import('@observablehq/plot');
let plotPromise: Promise<PlotModule> | null = null;
export function loadPlot(): Promise<PlotModule> {
  if (!plotPromise) plotPromise = import('@observablehq/plot');
  return plotPromise;
}

export const SERIES_COLORS = { asylum: '#993404', origin: '#ec7014', selected: '#662506' } as const;

export interface SeriesPoint {
  year: number;
  value: number | null;
  view: 'asylum' | 'origin';
}

/** Series for one metric from a country file. total_poc is summed from components. */
export function countrySeries(file: CountryFile, metric: AnyMetricId): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const comps: AnyMetricId[] =
    metric === 'total_poc'
      ? ['refugees', 'asylum_seekers', 'idps', 'stateless', 'ooc', 'oip']
      : [metric];
  for (const view of ['asylum', 'origin'] as const) {
    const arrs = comps.map((m) =>
      unpack(file[view].v[METRIC_IDS.indexOf(m as (typeof METRIC_IDS)[number])]!),
    );
    file.years.forEach((year, i) => {
      let v: number | null = null;
      for (const a of arrs) {
        const x = a[i] ?? null;
        if (x !== null) v = (v ?? 0) + x;
      }
      out.push({ year, value: v, view });
    });
  }
  return out;
}

/** Break a series into segments at nulls so lines show gaps instead of dropping to zero. */
export function segments<T extends { value: number | null }>(points: T[]): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const p of points) {
    if (p.value === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

export const PLOT_STYLE = {
  fontFamily: 'inherit',
  fontSize: '12px',
  background: 'transparent',
  overflow: 'visible',
} as const;

/** Serialise an SVG element for download. */
export function svgToString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}
