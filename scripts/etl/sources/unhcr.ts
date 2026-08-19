/**
 * Shared UNHCR source plumbing: fetch → sanitize (drop coo/coa) → normalise numbers.
 * Every query passes cf_type=ISO (§3.1 rule 1); every parser reads only *_iso (rule 2).
 */
import { fetchAll, unhcrUrl, countRows } from '../lib/paginate.ts';
import { sanitizeRow } from '../lib/codes.ts';
import { toInt } from '../../../src/lib/toNum.ts';
import { sha256 } from '../lib/atomic.ts';

export type RawRow = Record<string, unknown>;

export interface UnhcrFetchResult<T> {
  rows: T[];
  totalRows: number;
  endpoint: string;
  url: string;
  hash: string;
}

/** Fetch a full result set; returns sanitized rows (internal code fields removed). */
export async function fetchUnhcr(
  endpoint: string,
  params: Record<string, string | number | boolean>,
  label: string,
): Promise<UnhcrFetchResult<RawRow>> {
  const p = { ...params, cf_type: 'ISO' };
  const { items, totalRows } = await fetchAll<RawRow>(endpoint, p, label);
  const rows = items.map((r) => sanitizeRow(r) as RawRow);
  const url = unhcrUrl(endpoint, p);
  // hash the raw payload (stable ordering from API) for change detection
  const hash = sha256(JSON.stringify(items));
  return { rows, totalRows, endpoint, url, hash };
}

export { countRows, unhcrUrl };

/** Read an integer metric field with UNHCR semantics ("-" → null). */
export function num(row: RawRow, field: string): number | null {
  return toInt(row[field]);
}

/** Read an *_iso field as trimmed string (never the internal code). */
export function iso(row: RawRow, field: 'coo_iso' | 'coa_iso'): string {
  const v = row[field];
  return typeof v === 'string' ? v.trim().toUpperCase() : '';
}

/** Year as number (footnotes return strings). */
export function year(row: RawRow): number {
  const y = Number(row.year);
  if (!Number.isInteger(y)) throw new Error(`bad year ${String(row.year)}`);
  return y;
}
