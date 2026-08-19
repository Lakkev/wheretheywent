import { describe, it, expect } from 'vitest';
import en from '../../src/i18n/en.json';
import zh from '../../src/i18n/zh-Hant.json';
import { t, interpolate, localizePath, stripLocale, localeFromPath } from '../../src/i18n/ui';

describe('i18n dictionaries', () => {
  it('zh-Hant has exactly the same keys as en', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
  it('no empty values', () => {
    for (const [k, v] of Object.entries(en)) expect(v, k).not.toBe('');
    for (const [k, v] of Object.entries(zh)) expect(v, k).not.toBe('');
  });
  it('placeholders match between locales', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(ph(zh[k]), k).toEqual(ph(en[k]));
    }
  });
});

describe('t / interpolate', () => {
  it('interpolates params', () => {
    expect(interpolate('Year {year}: {n}', { year: 2025, n: 'x' })).toBe('Year 2025: x');
  });
  it('leaves unknown placeholders visible', () => {
    expect(interpolate('{a} {b}', { a: 1 })).toBe('1 {b}');
  });
  it('falls back to en', () => {
    expect(t('zh-Hant', 'nav.map')).toBe(t('en', 'nav.map'));
  });
});

describe('paths', () => {
  it('localizePath', () => {
    expect(localizePath('/', 'en')).toBe('/');
    expect(localizePath('/', 'zh-Hant')).toBe('/zh-Hant/');
    expect(localizePath('/country/SYR', 'zh-Hant')).toBe('/zh-Hant/country/SYR');
    expect(localizePath('/zh-Hant/compare', 'en')).toBe('/compare');
  });
  it('stripLocale / localeFromPath', () => {
    expect(stripLocale('/zh-Hant')).toBe('/');
    expect(stripLocale('/zh-Hantx')).toBe('/zh-Hantx');
    expect(localeFromPath('/zh-Hant/about')).toBe('zh-Hant');
    expect(localeFromPath('/about')).toBe('en');
  });
});
