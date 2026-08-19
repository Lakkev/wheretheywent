/**
 * UNHCR numeric fields are type-unstable (§3.2):
 *   "-"  → not reported → null
 *   "0"  → reported zero → 0
 *   123  → 123
 * null and 0 are semantically different and must stay distinguishable end-to-end.
 */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || s === '-' || s === 'NA' || s === 'n/a') return null;
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Integer variant — rounds half away from zero; null stays null. */
export function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
}
