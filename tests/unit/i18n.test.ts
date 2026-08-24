import { describe, it, expect } from 'vitest';
import en from '../../src/i18n/en.json';
import zh from '../../src/i18n/zh-Hant.json';
import fr from '../../src/i18n/fr.json';
import es from '../../src/i18n/es.json';
import { t, interpolate, localizePath, stripLocale, localeFromPath } from '../../src/i18n/ui';

const NON_EN: [string, Record<string, string>][] = [
  ['zh-Hant', zh],
  ['fr', fr],
  ['es', es],
];

describe('i18n dictionaries', () => {
  it.each(NON_EN)('%s has exactly the same keys as en', (_name, dict) => {
    expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
  });
  it('no empty values in any locale', () => {
    for (const [, dict] of [['en', en] as const, ...NON_EN])
      for (const [k, v] of Object.entries(dict)) expect(v, k).not.toBe('');
  });
  it.each(NON_EN)('placeholders match en in %s', (_name, dict) => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(ph(dict[k]!), k).toEqual(ph(en[k]));
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
  it('zh-Hant is genuinely translated (not an English copy)', () => {
    expect(t('zh-Hant', 'nav.map')).toBe('地圖');
    expect(t('zh-Hant', 'metric.refugees')).toBe('難民');
    expect(t('zh-Hant', 'view.origin')).toBe('他們從哪裡逃離');
  });
  it('fr is genuinely translated', () => {
    expect(t('fr', 'nav.map')).toBe('Carte');
    expect(t('fr', 'metric.refugees')).toBe('Réfugiés');
    expect(t('fr', 'view.origin')).toBe("D'où ils ont fui");
  });
  it('es is genuinely translated', () => {
    expect(t('es', 'nav.map')).toBe('Mapa');
    expect(t('es', 'metric.refugees')).toBe('Refugiados');
    expect(t('es', 'view.origin')).toBe('De dónde huyeron');
  });
  it.each(NON_EN)('at least 90%% of %s values differ from English', (_name, dict) => {
    const keys = Object.keys(en) as (keyof typeof en)[];
    const translated = keys.filter((k) => dict[k] !== en[k]).length;
    expect(translated / keys.length).toBeGreaterThan(0.9);
  });
});

describe('paths', () => {
  it('localizePath', () => {
    expect(localizePath('/', 'en')).toBe('/');
    expect(localizePath('/', 'zh-Hant')).toBe('/zh-Hant/');
    expect(localizePath('/', 'fr')).toBe('/fr/');
    expect(localizePath('/country/SYR', 'zh-Hant')).toBe('/zh-Hant/country/SYR');
    expect(localizePath('/country/SYR', 'es')).toBe('/es/country/SYR');
    expect(localizePath('/zh-Hant/compare', 'en')).toBe('/compare');
    expect(localizePath('/fr/compare', 'zh-Hant')).toBe('/zh-Hant/compare');
  });
  it('stripLocale / localeFromPath', () => {
    expect(stripLocale('/zh-Hant')).toBe('/');
    expect(stripLocale('/fr/about')).toBe('/about');
    expect(stripLocale('/zh-Hantx')).toBe('/zh-Hantx');
    expect(stripLocale('/france')).toBe('/france');
    expect(localeFromPath('/zh-Hant/about')).toBe('zh-Hant');
    expect(localeFromPath('/fr/about')).toBe('fr');
    expect(localeFromPath('/es')).toBe('es');
    expect(localeFromPath('/about')).toBe('en');
    expect(localeFromPath('/estonia')).toBe('en');
  });
});
