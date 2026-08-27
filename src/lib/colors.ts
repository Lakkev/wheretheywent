/**
 * Choropleth colour scales — earth palette「荒漠與土壤」(owner directive 2026-08-25,
 * supersedes spec D6 blues): ColorBrewer YlOrBr, desert sand → tilled soil. Sequential,
 * CVD-safe, never alarm-red. Pure functions: break computation + classification.
 * Tested in tests/unit/colors.test.ts.
 *
 *   null  → NODATA warm grey (not reported)
 *   0     → ZERO (lightest sand) — visually distinct from grey
 *   >0    → classes 1..K of the ramp
 */
export type ScaleKind = 'lin' | 'log' | 'quant';

/**
 * Decided ahead of need (external review #3, 2026-08-27): if a year-over-year CHANGE map is ever
 * built, the diverging ramp is teal ↔ brown (e.g. ColorBrewer BrBG), zero-centered on the sand
 * ZERO color. It is colorblind-safe, contains no red (the warm-earth guard in colors.test.ts
 * stays authoritative for the sequential ramp), and the brown end stays inside this palette.
 * Do not improvise a red/green diverging scale later.
 */
export const EARTH_9 = [
  '#ffffe5',
  '#fff7bc',
  '#fee391',
  '#fec44f',
  '#fe9929',
  '#ec7014',
  '#cc4c02',
  '#993404',
  '#662506',
] as const;
/** 7-class ramp used for positive values (skip the two lightest, reserved for zero/near-zero). */
export const RAMP = [
  '#fff7bc',
  '#fee391',
  '#fec44f',
  '#fe9929',
  '#ec7014',
  '#cc4c02',
  '#993404',
] as const;
export const ZERO_COLOR = '#ffffe5';
export const NODATA_COLOR = '#d3cec5';
export const NOFILL_COLOR = '#ece7dd';
export const K = RAMP.length;

export interface Breaks {
  kind: ScaleKind;
  /** K-1 ascending thresholds; value v is in class i when thresholds[i-1] <= v < thresholds[i] */
  thresholds: number[];
  min: number; // min positive value
  max: number;
  n: number; // number of positive values
}

/** Quantile of a sorted array at p ∈ [0,1] (linear interpolation). */
function quantileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (pos - lo);
}

/** Round a break to a "nice" number for legend readability (keeps monotonicity). */
export function niceNumber(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return v;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const m = v / base;
  const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return nice * base;
}

/**
 * Compute class breaks for the positive values of the current view.
 * Values ≤ 0 and null are excluded (they map to ZERO / NODATA).
 */
export function computeBreaks(
  values: Iterable<number | null | undefined>,
  kind: ScaleKind,
  k = K,
): Breaks {
  const pos: number[] = [];
  for (const v of values)
    if (v !== null && v !== undefined && Number.isFinite(v) && v > 0) pos.push(v);
  pos.sort((a, b) => a - b);
  const n = pos.length;
  if (n === 0) return { kind, thresholds: [], min: 0, max: 0, n: 0 };
  const min = pos[0]!;
  const max = pos[n - 1]!;
  const thresholds: number[] = [];
  if (kind === 'quant') {
    for (let i = 1; i < k; i++) thresholds.push(quantileSorted(pos, i / k));
  } else if (kind === 'log') {
    const lo = Math.log10(Math.max(min, 1));
    const hi = Math.log10(Math.max(max, 10));
    for (let i = 1; i < k; i++) thresholds.push(niceNumber(10 ** (lo + ((hi - lo) * i) / k)));
  } else {
    for (let i = 1; i < k; i++) thresholds.push(niceNumber(min + ((max - min) * i) / k));
  }
  // enforce strictly non-decreasing thresholds (nice rounding can create ties/decreases)
  for (let i = 1; i < thresholds.length; i++)
    if (thresholds[i]! < thresholds[i - 1]!) thresholds[i] = thresholds[i - 1]!;
  return { kind, thresholds, min, max, n };
}

/** Class index 0..K-1 for a positive value; -1 for zero; -2 for null. */
export function classify(v: number | null | undefined, b: Breaks): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return -2;
  if (v <= 0) return -1;
  const t = b.thresholds;
  let i = 0;
  while (i < t.length && v >= t[i]!) i++;
  return Math.min(i, K - 1);
}

export function colorFor(v: number | null | undefined, b: Breaks): string {
  const c = classify(v, b);
  if (c === -2) return NODATA_COLOR;
  if (c === -1) return ZERO_COLOR;
  return RAMP[c]!;
}

/** Legend entries: [{color, from, to}] with from/to numeric (to=null for open-ended). */
export function legendEntries(b: Breaks): { color: string; from: number; to: number | null }[] {
  const out: { color: string; from: number; to: number | null }[] = [];
  if (!b.n) return out;
  let from = b.min > 0 ? Math.min(b.min, b.thresholds[0] ?? b.min) : 0;
  for (let i = 0; i < K; i++) {
    const to = i < b.thresholds.length ? b.thresholds[i]! : null;
    out.push({ color: RAMP[i]!, from, to });
    if (to !== null) from = to;
  }
  return out;
}

/** Relative luminance contrast helper for text on a ramp colour (WCAG). */
export function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L < 0.35;
}
