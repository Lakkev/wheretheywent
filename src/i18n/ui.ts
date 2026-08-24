/**
 * Zero-dependency i18n.
 * - en.json is the source of truth for the key set.
 * - zh-Hant.json must have exactly the same keys (type-checked below; a missing
 *   translation is a compile error, a stray key is a compile error).
 * - zh-Hant.json is fully translated (2026-08-24); terminology is locked in docs/STYLE-zh.md,
 *   and a unit test asserts the file is genuinely translated (sentinels + >90% of values differ).
 */
import en from './en.json';
import zhHant from './zh-Hant.json';

export type Locale = 'en' | 'zh-Hant';
export type MessageKey = keyof typeof en;

export const LOCALES: readonly Locale[] = ['en', 'zh-Hant'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

// Compile-time guarantee: zh-Hant has every key from en and no extras.
const _zhHantCheck: Record<MessageKey, string> = zhHant;
const _enCheck: Record<keyof typeof zhHant, string> = en;
void _zhHantCheck;
void _enCheck;

const DICTS: Record<Locale, Record<MessageKey, string>> = {
  en,
  'zh-Hant': zhHant,
};

/** BCP-47 tags used for Intl.* formatting. */
export const INTL_TAG: Record<Locale, string> = { en: 'en', 'zh-Hant': 'zh-Hant-TW' };

export function isLocale(x: unknown): x is Locale {
  return x === 'en' || x === 'zh-Hant';
}

/** Interpolate `{name}` placeholders. Missing params are left as-is (visible in e2e). */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = params[k];
    return v === undefined || v === null ? m : String(v);
  });
}

export function t(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const dict = DICTS[locale] ?? DICTS.en;
  const s = dict[key] ?? DICTS.en[key] ?? key;
  return interpolate(s, params);
}

/** Curried helper for components: const tr = useT(locale); tr('nav.map') */
export function useT(locale: Locale) {
  return (key: MessageKey, params?: Record<string, string | number>) => t(locale, key, params);
}

/** Locale from an Astro URL pathname. */
export function localeFromPath(pathname: string): Locale {
  return pathname === '/zh-Hant' || pathname.startsWith('/zh-Hant/') ? 'zh-Hant' : 'en';
}

/** Build a path for a locale: localizePath('/country/SYR', 'zh-Hant') → '/zh-Hant/country/SYR' */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.replace(/^\/zh-Hant(?=\/|$)/, '') || '/';
  if (locale === 'en') return clean;
  return clean === '/' ? '/zh-Hant/' : `/zh-Hant${clean}`;
}

/** Strip locale prefix: '/zh-Hant/compare' → '/compare' */
export function stripLocale(path: string): string {
  return path.replace(/^\/zh-Hant(?=\/|$)/, '') || '/';
}
