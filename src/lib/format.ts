/** Number/date formatting helpers (pure; Intl-based). */
import type { Locale } from '../i18n/ui';
import { INTL_TAG } from '../i18n/ui';

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(locale: Locale, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(INTL_TAG[locale], opts);
    fmtCache.set(key, f);
  }
  return f;
}

/** Full integer with grouping: 2,940,735. null → "—". */
export function fmtInt(v: number | null | undefined, locale: Locale = 'en'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return nf(locale, { maximumFractionDigits: 0 }).format(v);
}

/** Compact: 2.9M, 154K, 12. null → "—". */
export function fmtCompact(v: number | null | undefined, locale: Locale = 'en'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (Math.abs(v) < 1000) return nf(locale, { maximumFractionDigits: 0 }).format(v);
  return nf(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

/** Per-1,000 rate: 0.00 – 999.9 with sensible precision. */
export function fmtRate(v: number | null | undefined, locale: Locale = 'en'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return nf(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v);
}

/** Generic value formatter depending on normalisation. */
export function fmtValue(
  v: number | null | undefined,
  norm: 'abs' | 'per1k',
  locale: Locale = 'en',
  compact = false,
): string {
  if (norm === 'per1k') return fmtRate(v, locale);
  return compact ? fmtCompact(v, locale) : fmtInt(v, locale);
}

export function fmtPct(v: number | null | undefined, locale: Locale = 'en'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return nf(locale, { style: 'percent', maximumFractionDigits: 1 }).format(v);
}

/** "31 December 2025" style long date from YYYY-MM-DD or ISO. */
export function fmtDateLong(iso: string | null | undefined, locale: Locale = 'en'): string {
  if (!iso) return '—';
  const d = parseDate(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat(INTL_TAG[locale], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/** "2025-12-31" ISO date part. */
export function fmtDateIso(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export function parseDate(iso: string): Date | null {
  const s = iso.length === 10 ? iso + 'T00:00:00Z' : iso;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Month name from "YYYY-MM". */
export function fmtMonth(ym: string, locale: Locale = 'en'): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return new Intl.DateTimeFormat(INTL_TAG[locale], {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
