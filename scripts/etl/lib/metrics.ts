/** metrics.json — definitions, units, caveats, source ids (§6, §13.2 #15). zh-Hant via definition_zh/caveats_zh. */
import type { MetricsFile, MetricDef, AnyMetricId } from '../../../src/lib/types.ts';
import { METRIC_I18N } from './metrics-i18n.ts';

const U = 'unhcr_population';

const DEFS: Record<AnyMetricId, Omit<MetricDef, 'id'>> = {
  refugees: {
    label: 'Refugees',
    definition:
      'Persons recognised as refugees under the 1951 Convention/1967 Protocol, the 1969 OAU Convention, in accordance with the UNHCR Statute, persons granted complementary/subsidiary forms of protection, or those enjoying temporary protection. Includes people in a refugee-like situation. Excludes Palestine refugees under UNRWA’s mandate.',
    definition_zh:
      '依 1951 年《難民地位公約》/1967 年議定書、1969 年《非洲統一組織公約》或 UNHCR 章程被認定為難民者，以及獲得補充性/輔助性保護或臨時保護者；含「類難民處境」人口。不含 UNRWA 職權下的巴勒斯坦難民。',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: [
      'Year-end stock (31 December).',
      'Excludes ~6 million UNRWA-registered Palestine refugees.',
    ],
    caveats_zh: ['年末存量（12 月 31 日）。', '不含約 600 萬 UNRWA 登記的巴勒斯坦難民。'],
  },
  asylum_seekers: {
    label: 'Asylum-seekers',
    definition:
      'Individuals who have sought international protection and whose claims for refugee status have not yet been determined (pending cases).',
    definition_zh: '已提出國際保護申請、但難民身分尚待決定者（待審個案）。',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: ['Year-end pending cases, counted in persons.'],
    caveats_zh: ['年末待審個案，以人數計。'],
  },
  idps: {
    label: 'Internally displaced persons (IDPs)',
    definition:
      'People displaced within their own country by conflict or violence (as compiled by IDMC and reported by UNHCR). Counted under their country (origin = asylum).',
    definition_zh:
      '因衝突或暴力而在本國境內流離失所者（由 IDMC 彙整、UNHCR 轉載）。計入其本國（來源國=收容國）。',
    unit: 'persons',
    source_id: 'unhcr_idmc',
    views: ['asylum', 'origin'],
    caveats: [
      'Source: IDMC via UNHCR. Disaster displacement is not included.',
      'Identical in both views (internal displacement has no host country).',
    ],
    caveats_zh: [
      '來源：IDMC（經 UNHCR）。不含災害所致的流離失所。',
      '兩種視角下數字相同（境內流離失所沒有收容國）。',
    ],
  },
  stateless: {
    label: 'Stateless persons',
    definition:
      'Persons not considered as nationals by any State under the operation of its law, including persons of undetermined nationality.',
    definition_zh: '依任何國家法律皆不被視為其國民者，含國籍未定者。',
    unit: 'persons',
    source_id: U,
    views: ['asylum'],
    caveats: ['Reported by country of residence only; many countries do not report.'],
    caveats_zh: ['僅按居住國報告；許多國家未報告。'],
    coverage_from: 2004,
  },
  ooc: {
    label: 'Others of concern',
    definition:
      'Individuals who do not necessarily fall directly into any of the other groups but to whom UNHCR has extended its protection and/or assistance services.',
    definition_zh: '不直接屬於其他類別、但獲 UNHCR 延伸保護或協助者。',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: [],
    caveats_zh: [],
  },
  returned_refugees: {
    label: 'Returned refugees',
    definition:
      'Former refugees who returned to their country of origin during the calendar year, spontaneously or in an organised fashion.',
    definition_zh: '於該年度內自行或經安排返回來源國的前難民。',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: ['Flow during the year, not a stock.'],
    caveats_zh: ['年度流量，非存量。'],
  },
  returned_idps: {
    label: 'Returned IDPs',
    definition: 'Former IDPs who returned to their area of origin during the calendar year.',
    definition_zh: '於該年度內返回原居地的前境內流離失所者。',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: ['Flow during the year, not a stock.'],
    caveats_zh: ['年度流量，非存量。'],
  },
  oip: {
    label: 'Other people in need of international protection',
    definition:
      'People outside their country of origin who are likely in need of international protection but whose status has not been determined (used notably for Venezuelans abroad since 2018).',
    definition_zh:
      '身在來源國境外、很可能需要國際保護、但身分尚未確定者（2018 年起使用，主要為境外委內瑞拉人）。',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: ['Reported since 2018; mostly Venezuelans displaced abroad.'],
    caveats_zh: ['自 2018 年起報告；多為流落境外的委內瑞拉人。'],
    coverage_from: 2018,
  },
  hst: {
    label: 'Host community',
    definition:
      'Members of host communities benefiting from UNHCR programmes (reported for a small number of operations).',
    definition_zh: '受惠於 UNHCR 方案的收容社區成員（僅少數行動報告）。',
    unit: 'persons',
    source_id: U,
    views: ['asylum'],
    caveats: ['Not a displaced population; excluded from totals.'],
    caveats_zh: ['非流離失所人口；不計入總數。'],
  },
  total_poc: {
    label: 'Total people of concern',
    definition:
      'Sum of refugees, asylum-seekers, IDPs, stateless persons, others of concern and other people in need of international protection (excludes host community and returnees).',
    definition_zh:
      '難民、庇護申請者、境內流離失所者、無國籍者、其他受關注者與其他需要國際保護者之總和（不含收容社區與回返者）。',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: [
      'Derived on the client from the component metrics; a null component is treated as 0 only when at least one component is reported.',
      'This sum can differ slightly from the headline totals UNHCR publishes (e.g. in Global Trends), which are compiled under UNHCR’s own aggregation rules.',
    ],
    caveats_zh: [
      '由前端自各元件指標加總；僅當至少一個元件有報告時，null 元件才視為 0。',
      '本站加總可能與 UNHCR 自行發布的整體數字（如《全球趨勢》報告）略有出入——UNHCR 採用其自身的彙整規則。',
    ],
    derived: true,
    components: ['refugees', 'asylum_seekers', 'idps', 'stateless', 'ooc', 'oip'],
  },
};

export function buildMetrics(): MetricsFile {
  const metrics = {} as Record<AnyMetricId, MetricDef>;
  for (const [id, d] of Object.entries(DEFS) as [AnyMetricId, Omit<MetricDef, 'id'>][]) {
    const x = METRIC_I18N[id];
    metrics[id] = {
      id,
      ...d,
      // full per-locale maps — zh-Hant text lives in DEFS, the other five in metrics-i18n.ts
      definition_i18n: { 'zh-Hant': d.definition_zh ?? d.definition, ...x.definition },
      caveats_i18n: { 'zh-Hant': d.caveats_zh ?? d.caveats, ...x.caveats },
    };
  }
  return { schema: 1, metrics };
}
