/**
 * Source metadata (publisher/license/attribution/caveats) and the three time concepts (§7.9):
 *   data_as_of   — what date the upstream data covers
 *   retrieved_at — when WE fetched it; only advances when the content hash changes
 *   snapshot_id  — git short hash (set at promote/commit time)
 */
import type { SourceEntry, SourceStatus } from '../../../src/lib/types.ts';
import type { SourceId } from '../config.ts';
import { CAVEATS_I18N } from './caveats-i18n.ts';

export interface SourceStatic {
  publisher: string;
  title: string;
  landing_page: string;
  license: { id: string; url: string };
  attribution: string;
  period_type: SourceEntry['period_type'];
  caveats: string[];
  caveats_zh: string[];
}

const CC_BY_4 = { id: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
const CC_BY_IGO = { id: 'CC-BY-IGO', url: 'https://creativecommons.org/licenses/by/3.0/igo/' };
const CC_BY_3_IGO = {
  id: 'CC-BY-3.0-IGO',
  url: 'https://creativecommons.org/licenses/by/3.0/igo/',
};
const PD = { id: 'Public Domain', url: 'https://www.naturalearthdata.com/about/terms-of-use/' };

const UNHCR_ATTR = 'UNHCR Refugee Population Statistics Database';
const UNHCR_LANDING = 'https://www.unhcr.org/refugee-statistics/';
const UNHCR_CAVEATS = [
  'Compiled from what governments and UNHCR operations report. States have incentives to over- and under-count — funding appeals, sovereignty claims, contested legal statuses. A missing figure is not an absence of displaced people.',
  'Excludes Palestine refugees registered with UNRWA (about 6 million), which publishes separate statistics.',
  '"-" in the source means not reported; it is stored as null and is different from 0 (reported zero).',
  'Figures are year-end stocks (31 December) unless stated otherwise.',
];
const UNHCR_CAVEATS_ZH = [
  '數字彙整自各國政府與 UNHCR 行動的報告。國家有高報或低報的誘因——籌款訴求、主權主張、具爭議的法律身分。缺漏的數字不代表沒有流離失所者。',
  '不含 UNRWA 登記之巴勒斯坦難民（約 600 萬），UNRWA 另有獨立統計。',
  '來源中的 "-" 表示未報告，儲存為 null，與 0（確實為零）意義不同。',
  '除另有說明外，數字為年末（12 月 31 日）存量。',
];

export const SOURCE_STATIC: Record<SourceId, SourceStatic> = {
  unhcr_countries: {
    publisher: 'UNHCR',
    title: 'Refugee Population Statistics Database — country list',
    landing_page: UNHCR_LANDING,
    license: CC_BY_4,
    attribution: UNHCR_ATTR,
    period_type: 'annual',
    caveats: [
      'Country names follow UNHCR usage. Kosovo is reported under "Serbia and Kosovo: S/RES/1244 (1999)". Taiwan is not listed.',
    ],
    caveats_zh: [
      '國名沿用 UNHCR 用法。科索沃併入「Serbia and Kosovo: S/RES/1244 (1999)」。台灣未列入。',
    ],
  },
  unhcr_population: {
    publisher: 'UNHCR',
    title: 'Refugee Population Statistics Database — population figures',
    landing_page: UNHCR_LANDING,
    license: CC_BY_4,
    attribution: UNHCR_ATTR,
    period_type: 'year-end',
    caveats: [
      ...UNHCR_CAVEATS,
      'IDP figures are sourced by UNHCR from IDMC.',
      'Refugees include people in refugee-like situations.',
    ],
    caveats_zh: [
      ...UNHCR_CAVEATS_ZH,
      'IDP 數字由 UNHCR 轉引自 IDMC。',
      '難民數含「類難民處境」人口。',
    ],
  },
  unhcr_demographics: {
    publisher: 'UNHCR',
    title: 'Refugee Population Statistics Database — demographics',
    landing_page: UNHCR_LANDING,
    license: CC_BY_4,
    attribution: UNHCR_ATTR,
    period_type: 'year-end',
    caveats: [
      'Age/sex breakdown is available for a subset of the population; rows with zero breakdown but a non-zero total mean no demographic data was reported.',
      'Age groups: 0–4, 5–11, 12–17, 18–59, 60+, other/unknown.',
    ],
    caveats_zh: [
      '年齡/性別細分僅涵蓋部分人口；細分皆為 0 但總數非 0 表示未報告人口結構。',
      '年齡組：0–4、5–11、12–17、18–59、60+、其他/未知。',
    ],
  },
  unhcr_idmc: {
    publisher: 'UNHCR (data: IDMC)',
    title: 'IDMC internal displacement figures via UNHCR API',
    landing_page: 'https://www.internal-displacement.org/database/',
    license: CC_BY_IGO,
    attribution:
      'Internal Displacement Monitoring Centre (IDMC), via UNHCR Refugee Population Statistics Database',
    period_type: 'year-end',
    caveats: [
      'Conflict and violence IDP stock figures as reported by IDMC; disaster displacement is not included.',
    ],
    caveats_zh: ['IDMC 報告之衝突與暴力所致 IDP 存量；不含災害流離失所。'],
  },
  unhcr_solutions: {
    publisher: 'UNHCR',
    title: 'Refugee Population Statistics Database — solutions',
    landing_page: UNHCR_LANDING,
    license: CC_BY_4,
    attribution: UNHCR_ATTR,
    period_type: 'annual',
    caveats: [
      'Flows during the year (returns, resettlement departures, naturalisations), not stocks.',
    ],
    caveats_zh: ['年度流量（返回、重新安置、歸化），非存量。'],
  },
  unhcr_asylum_applications: {
    publisher: 'UNHCR',
    title: 'Refugee Population Statistics Database — asylum applications',
    landing_page: UNHCR_LANDING,
    license: CC_BY_4,
    attribution: UNHCR_ATTR,
    period_type: 'annual',
    caveats: [
      'Only rows measured in persons (app_pc = P) are kept; case-based rows (C) are excluded to avoid double counting.',
    ],
    caveats_zh: ['僅保留以人數計（app_pc = P）之列；以案件計（C）之列排除以避免重複計數。'],
  },
  unhcr_footnotes: {
    publisher: 'UNHCR',
    title: 'Refugee Population Statistics Database — footnotes',
    landing_page: UNHCR_LANDING,
    license: CC_BY_4,
    attribution: UNHCR_ATTR,
    period_type: 'annual',
    caveats: [],
    caveats_zh: [],
  },
  unhcr_nowcasting: {
    publisher: 'UNHCR',
    title: 'Refugee Population Statistics Database — nowcasting (estimates)',
    landing_page: UNHCR_LANDING,
    license: CC_BY_4,
    attribution: UNHCR_ATTR,
    period_type: 'monthly',
    caveats: [
      'Statistical estimates produced by UNHCR to predict current figures; not reported counts. Only refugees and asylum-seekers by country of asylum.',
      'No confidence intervals are published.',
    ],
    caveats_zh: [
      'UNHCR 以統計方法推估之當前數字，非正式報告值。僅含庇護國面向之難民與庇護申請者。',
      '未公布信賴區間。',
    ],
  },
  wpp_population: {
    publisher: 'United Nations, DESA, Population Division',
    title: 'World Population Prospects 2024 — total population by sex',
    landing_page: 'https://population.un.org/wpp/',
    license: CC_BY_3_IGO,
    attribution:
      'United Nations, Department of Economic and Social Affairs, Population Division (2024). World Population Prospects 2024',
    period_type: 'annual',
    caveats: [
      'Mid-year (1 July) population; used as the denominator for per-1,000 rates against year-end displacement stocks.',
      'Values for years after the estimate base year are medium-variant projections.',
    ],
    caveats_zh: [
      '年中（7 月 1 日）人口；作為每千人比率的分母（分子為年末存量）。',
      '估計基準年之後的年份為中推計情境之預測值。',
    ],
  },
  idmc_idu: {
    publisher: 'IDMC',
    title: 'Internal Displacement Updates (IDU) — last 180 days',
    landing_page: 'https://www.internal-displacement.org/database/displacement-data/',
    license: CC_BY_IGO,
    attribution: 'Internal Displacement Monitoring Centre (IDMC), Internal Displacement Updates',
    period_type: 'rolling',
    caveats: [
      'Preliminary event-level estimates compiled from media and partner reports; revised figures are published in the GIDD.',
      'Figures are displacement events (flows) and may double count the same people displaced more than once.',
    ],
    caveats_zh: [
      '自媒體與夥伴報告彙整之初步事件層級估計；校正版於 GIDD 發布。',
      '數字為流離失所事件（流量），同一人多次流離可能重複計算。',
    ],
  },
  natural_earth: {
    publisher: 'Natural Earth (via world-atlas)',
    title: 'Admin 0 – Countries, 1:50m',
    landing_page: 'https://www.naturalearthdata.com/',
    license: PD,
    attribution: 'Made with Natural Earth',
    period_type: 'annual',
    caveats: [
      'Boundaries are simplified for display and do not imply any opinion concerning the legal status of any territory.',
    ],
    caveats_zh: ['邊界經簡化以利顯示，不代表對任何領土法律地位之意見。'],
  },
};

export interface BuildSourceArgs {
  id: SourceId;
  data_as_of: string;
  coverage: { year_min: number; year_max: number };
  content_hash: string; // sha256 hex
  endpoints?: string[];
  previous?: SourceEntry | null;
  now: string; // ISO timestamp
  status?: SourceStatus;
}

/** Build a fresh OK entry; retrieved_at only advances when the hash changed (§7.9). */
export function buildSourceEntry(a: BuildSourceArgs): SourceEntry {
  const s = SOURCE_STATIC[a.id];
  const hash = `sha256:${a.content_hash}`;
  const unchanged = a.previous && a.previous.content_hash === hash;
  const retrieved_at = unchanged ? a.previous!.retrieved_at : a.now;
  return {
    publisher: s.publisher,
    title: s.title,
    landing_page: s.landing_page,
    license: s.license,
    attribution: s.attribution,
    data_as_of: a.data_as_of,
    period_type: s.period_type,
    retrieved_at,
    coverage: a.coverage,
    content_hash: hash,
    status: a.status ?? 'ok',
    caveats: s.caveats,
    caveats_zh: s.caveats_zh,
    caveats_i18n: { 'zh-Hant': s.caveats_zh, ...CAVEATS_I18N[a.id] },
    endpoints: a.endpoints,
  };
}

/**
 * Mark an existing entry not-ok (keeps previous data, records error).
 * status 'stale' = fetch/validation failure; 'unstable' = upstream was publishing mid-run (§7.2) —
 * expected to clear on the next daily run, but stale_since still accrues so a persistent
 * condition escalates the same way.
 */
export function markStale(
  previous: SourceEntry | null,
  id: SourceId,
  error: string,
  now: string,
  status: 'stale' | 'unstable' = 'stale',
): SourceEntry {
  const s = SOURCE_STATIC[id];
  const base: SourceEntry =
    previous ??
    ({
      publisher: s.publisher,
      title: s.title,
      landing_page: s.landing_page,
      license: s.license,
      attribution: s.attribution,
      data_as_of: '',
      period_type: s.period_type,
      retrieved_at: '',
      coverage: { year_min: 0, year_max: 0 },
      content_hash: '',
      status: 'stale',
      caveats: s.caveats,
      caveats_zh: s.caveats_zh,
    } satisfies SourceEntry);
  return {
    ...base,
    status,
    stale_since: base.status !== 'ok' && base.stale_since ? base.stale_since : now,
    last_error: error.slice(0, 500),
  };
}
