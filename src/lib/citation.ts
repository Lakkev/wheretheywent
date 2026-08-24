/**
 * Citation builders (§10.3): APA 7, Chicago author-date, BibTeX, "cite this page". Pure functions,
 * en + zh-Hant templates. All dates are rendered with Intl for the locale.
 */
import type { Locale } from '../i18n/ui';
import type { SourceEntry } from './types';
import { fmtDateLong } from './format';

export interface CitationInput {
  locale: Locale;
  /** Dataset snapshot id — rendered as "(Version …)" / BibTeX version. */
  version?: string;
  /** e.g. "Syria — internally displaced persons, 1951–2025" */
  title: string;
  /** absolute permalink to the view */
  url: string;
  /** primary sources (first is the main one) */
  sources: SourceEntry[];
  /** access date ISO (defaults to today) */
  accessed?: string;
  siteName?: string;
  siteNameZh?: string;
}

export interface Citations {
  apa: string;
  chicago: string;
  bibtex: string;
  page: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function year(iso: string): string {
  return iso.slice(0, 4);
}

function bibKey(title: string, url: string, pubYear: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 3)
    .join('-');
  // short content hash keeps keys unique across years/metrics sharing a 3-token prefix (#6)
  let h = 0;
  const src = title + '|' + url;
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
  return `wheretheywent-${slug || 'view'}-${h.toString(36).slice(0, 5)}-${pubYear}`;
}

function bibEscape(s: string): string {
  return s.replace(/([&%$#_{}~^\\])/g, '\\$1');
}

export function buildCitations(inp: CitationInput): Citations {
  const accessed = inp.accessed ?? today();
  const site =
    inp.locale === 'zh-Hant'
      ? (inp.siteNameZh ?? '他們去了哪裡 (Where They Went)')
      : inp.locale === 'zh-Hans'
        ? (inp.siteNameZh ?? '他们去了哪里 (Where They Went)')
        : (inp.siteName ?? 'Where They Went');
  const primary = inp.sources[0];
  const dataAsOf = primary ? fmtDateLong(primary.data_as_of, inp.locale) : '';
  const retrieved = primary ? fmtDateLong(primary.retrieved_at, inp.locale) : '';
  const accessedLong = fmtDateLong(accessed, inp.locale);
  const srcList = inp.sources.map((s) => s.attribution).join('; ');
  // Publication year = the year the DATA covers, not the year the reader clicked (#4).
  const y = primary?.data_as_of ? year(primary.data_as_of) : year(accessed);
  const ver = inp.version ? ` (Version ${inp.version})` : '';

  if (inp.locale === 'zh-Hant' || inp.locale === 'zh-Hans') {
    const L =
      inp.locale === 'zh-Hans'
        ? {
            data: '数据：',
            asOf: '数据截至 ',
            retr: '获取于 ',
            acc: '访问日期 ',
            accAt: '访问于 ',
            read: '读取日期 ',
            ds: '数据集',
            snap: '快照 ',
          }
        : {
            data: '資料：',
            asOf: '資料截至 ',
            retr: '擷取於 ',
            acc: '存取日期 ',
            accAt: '存取於 ',
            read: '讀取日期 ',
            ds: '資料集',
            snap: '快照 ',
          };
    const page = `${site}。「${inp.title}」。${L.data}${srcList}（${L.asOf}${dataAsOf}；${L.retr}${retrieved}）。${inp.url} [${L.acc}${accessedLong}]。${inp.version ? `${L.snap}${inp.version}。` : ''}`;
    const apa = `${site}. (${y}). ${inp.title}${ver} [${L.ds}]. ${L.data}${srcList}（${L.asOf}${dataAsOf}）. ${L.read}${accessedLong}，取自 ${inp.url}`;
    const chicago = `${site}. ${y}. 「${inp.title}」. ${L.data}${srcList}（${L.asOf}${dataAsOf}）. ${L.accAt}${accessedLong}. ${inp.url}.`;
    const bibtex = bib(inp, site, accessed, srcList, dataAsOf, String(y));
    return { apa, chicago, bibtex, page };
  }
  const page = `${site}. "${inp.title}." Data: ${srcList} (data as of ${dataAsOf}; retrieved ${retrieved}). ${inp.url} [accessed ${accessedLong}].${inp.version ? ` Snapshot ${inp.version}.` : ''}`;
  const apa = `${site}. (${y}). ${inp.title}${ver} [Data set]. Data: ${srcList} (data as of ${dataAsOf}). Retrieved ${accessedLong}, from ${inp.url}`;
  const chicago = `${site}. ${y}. "${inp.title}." Data: ${srcList} (data as of ${dataAsOf}). Accessed ${accessedLong}. ${inp.url}.`;
  const bibtex = bib(inp, site, accessed, srcList, dataAsOf, String(y));
  return { apa, chicago, bibtex, page };
}

function bib(
  inp: CitationInput,
  site: string,
  accessed: string,
  srcList: string,
  dataAsOf: string,
  pubYear: string,
): string {
  const key = bibKey(inp.title, inp.url, pubYear);
  return [
    // biblatex @dataset (classic BibTeX users: treat as @misc; CJK titles need XeLaTeX)
    `@dataset{${key},`,
    `  author = {${bibEscape(site)}},`,
    `  title = {${bibEscape(inp.title)}},`,
    `  year = {${pubYear}},`,
    ...(inp.version ? [`  version = {${inp.version}},`] : []),
    `  url = {${inp.url}},`,
    `  urldate = {${accessed}},`,
    `  note = {Data: ${bibEscape(srcList)} (data as of ${bibEscape(dataAsOf)}).}`,
    `}`,
  ].join('\n');
}

/** Title for a map view, e.g. "Refugees by country of asylum, 2024" */
export function viewTitle(args: {
  metricLabel: string;
  viewLabel: string;
  year: number;
  country?: string | null;
  norm?: 'abs' | 'per1k';
  normLabel?: string;
}): string {
  const base = args.country
    ? `${args.country} — ${args.metricLabel.toLowerCase()}`
    : `${args.metricLabel} — ${args.viewLabel.toLowerCase()}`;
  const norm = args.norm === 'per1k' && args.normLabel ? `, ${args.normLabel.toLowerCase()}` : '';
  return `${base}${norm}, ${args.year}`;
}
