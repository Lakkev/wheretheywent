/**
 * Columnar + zero-run codec (§7.6). Single implementation shared by ETL (Node) and the browser.
 *
 * A series is an array aligned with a `years` axis:
 *   number  → reported value (integer)
 *   null    → not reported ("-")
 * Packed form replaces runs of ≥ MIN_RUN consecutive zeros with ["z", n] and runs of ≥ MIN_RUN
 * consecutive nulls with ["n", n]. Zero and null never share a run, so the distinction survives.
 *
 * Invariant (tested): unpack(pack(s)) deep-equals s for any s of (int|null)[].
 */
import type { PackedSeries, PackedCell } from './types';

type Run = ['z' | 'n', number];

export const MIN_RUN = 4;

export function pack(series: readonly (number | null)[]): PackedSeries {
  const out: PackedSeries = [];
  let i = 0;
  const n = series.length;
  while (i < n) {
    const v = series[i] ?? null;
    if (v === 0 || v === null) {
      let j = i;
      while (j < n && (series[j] ?? null) === v) j++;
      const run = j - i;
      if (run >= MIN_RUN) {
        out.push([v === 0 ? 'z' : 'n', run] as Run as PackedCell);
      } else {
        for (let k = 0; k < run; k++) out.push(v);
      }
      i = j;
    } else {
      out.push(v);
      i++;
    }
  }
  return out;
}

export function unpack(packed: readonly PackedCell[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (const c of packed) {
    if (Array.isArray(c)) {
      const fill = (c as Run)[0] === 'z' ? 0 : null;
      const run = c[1];
      for (let k = 0; k < run; k++) out.push(fill);
    } else {
      out.push(c);
    }
  }
  return out;
}

/** Length of an unpacked series without materializing it. */
export function packedLength(packed: readonly PackedCell[]): number {
  let n = 0;
  for (const c of packed) n += Array.isArray(c) ? c[1] : 1;
  return n;
}

/** Value at index i of a packed series (O(n) but tiny n). */
export function packedAt(packed: readonly PackedCell[], i: number): number | null {
  let pos = 0;
  for (const c of packed) {
    if (Array.isArray(c)) {
      if (i < pos + c[1]) return (c as Run)[0] === 'z' ? 0 : null;
      pos += c[1];
    } else {
      if (i === pos) return c;
      pos++;
    }
  }
  return null;
}

/** True when every value is null (series carries no information). */
export function isAllNull(series: readonly (number | null)[]): boolean {
  return series.every((v) => v === null);
}
