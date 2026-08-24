/**
 * Zero-dependency i18n.
 * - en.json is the source of truth for the key set.
 * - Every other locale file must have exactly the same keys (type-checked below; a missing
 *   translation is a compile error, a stray key is a compile error).
 * - zh-Hant / fr / es are fully translated UI dictionaries; long-form doc pages are tiered —
 *   pages not yet localised show the English content behind an explicit banner (doc.untranslated).
 * - zh terminology is locked in docs/STYLE-zh.md; unit tests assert each dictionary is genuinely
 *   translated (sentinels + >90% of values differ from English).
 */
import en from './en.json';
import zhHant from './zh-Hant.json';
import fr from './fr.json';
import es from './es.json';

export type Locale = 'en' | 'zh-Hant' | 'fr' | 'es';
export type MessageKey = keyof typeof en;

export const LOCALES: readonly Locale[] = ['en', 'zh-Hant', 'fr', 'es'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

/** Native-language names — language switcher labels and "untranslated" banners. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'zh-Hant': '繁體中文',
  fr: 'Français',
  es: 'Español',
};

// Compile-time guarantee: every locale has every key from en and no extras.
const _zh1: Record<MessageKey, string> = zhHant;
const _zh2: Record<keyof typeof zhHant, string> = en;
const _fr1: Record<MessageKey, string> = fr;
const _fr2: Record<keyof typeof fr, string> = en;
const _es1: Record<MessageKey, string> = es;
const _es2: Record<keyof typeof es, string> = en;
void _zh1;
void _zh2;
void _fr1;
void _fr2;
void _es1;
void _es2;

const DICTS: Record<Locale, Record<MessageKey, string>> = {
  en,
  'zh-Hant': zhHant,
  fr,
  es,
};

/** BCP-47 tags used for Intl.* formatting. */
export const INTL_TAG: Record<Locale, string> = {
  en: 'en',
  'zh-Hant': 'zh-Hant-TW',
  fr: 'fr',
  es: 'es',
};

const PREFIXED = LOCALES.filter((l) => l !== DEFAULT_LOCALE);
const PREFIX_RE = new RegExp(`^/(${PREFIXED.join('|')})(?=/|$)`);

export function isLocale(x: unknown): x is Locale {
  return (LOCALES as readonly string[]).includes(x as string);
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
  const m = PREFIX_RE.exec(pathname);
  return m && isLocale(m[1]) ? m[1] : DEFAULT_LOCALE;
}

/** Build a path for a locale: localizePath('/country/SYR', 'fr') → '/fr/country/SYR' */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.replace(PREFIX_RE, '') || '/';
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${locale}/` : `/${locale}${clean}`;
}

/** Strip locale prefix: '/fr/compare' → '/compare' */
export function stripLocale(path: string): string {
  return path.replace(PREFIX_RE, '') || '/';
}
