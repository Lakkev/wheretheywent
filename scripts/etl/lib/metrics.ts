/** metrics.json — definitions, units, caveats, source ids (§6, §13.2 #15). */
import type { MetricsFile, MetricDef, AnyMetricId } from '../../../src/lib/types.ts';

const U = 'unhcr_population';

const DEFS: Record<AnyMetricId, Omit<MetricDef, 'id'>> = {
  refugees: {
    label: 'Refugees',
    definition:
      'Persons recognised as refugees under the 1951 Convention/1967 Protocol, the 1969 OAU Convention, in accordance with the UNHCR Statute, persons granted complementary/subsidiary forms of protection, or those enjoying temporary protection. Includes people in a refugee-like situation. Excludes Palestine refugees under UNRWA’s mandate.',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: [
      'Year-end stock (31 December).',
      'Excludes ~6 million UNRWA-registered Palestine refugees.',
    ],
  },
  asylum_seekers: {
    label: 'Asylum-seekers',
    definition:
      'Individuals who have sought international protection and whose claims for refugee status have not yet been determined (pending cases).',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: ['Year-end pending cases, counted in persons.'],
  },
  idps: {
    label: 'Internally displaced persons (IDPs)',
    definition:
      'People displaced within their own country by conflict or violence (as compiled by IDMC and reported by UNHCR). Counted under their country (origin = asylum).',
    unit: 'persons',
    source_id: 'unhcr_idmc',
    views: ['asylum', 'origin'],
    caveats: [
      'Source: IDMC via UNHCR. Disaster displacement is not included.',
      'Identical in both views (internal displacement has no host country).',
    ],
  },
  stateless: {
    label: 'Stateless persons',
    definition:
      'Persons not considered as nationals by any State under the operation of its law, including persons of undetermined nationality.',
    unit: 'persons',
    source_id: U,
    views: ['asylum'],
    caveats: ['Reported by country of residence only; many countries do not report.'],
  },
  ooc: {
    label: 'Others of concern',
    definition:
      'Individuals who do not necessarily fall directly into any of the other groups but to whom UNHCR has extended its protection and/or assistance services.',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: [],
  },
  returned_refugees: {
    label: 'Returned refugees',
    definition:
      'Former refugees who returned to their country of origin during the calendar year, spontaneously or in an organised fashion.',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: ['Flow during the year, not a stock.'],
  },
  returned_idps: {
    label: 'Returned IDPs',
    definition: 'Former IDPs who returned to their area of origin during the calendar year.',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: ['Flow during the year, not a stock.'],
  },
  oip: {
    label: 'Other people in need of international protection',
    definition:
      'People outside their country of origin who are likely in need of international protection but whose status has not been determined (used notably for Venezuelans abroad since 2018).',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: ['Reported since 2018; mostly Venezuelans displaced abroad.'],
  },
  hst: {
    label: 'Host community',
    definition:
      'Members of host communities benefiting from UNHCR programmes (reported for a small number of operations).',
    unit: 'persons',
    source_id: U,
    views: ['asylum'],
    caveats: ['Not a displaced population; excluded from totals.'],
  },
  total_poc: {
    label: 'Total people of concern',
    definition:
      'Sum of refugees, asylum-seekers, IDPs, stateless persons, others of concern and other people in need of international protection (excludes host community and returnees).',
    unit: 'persons',
    source_id: U,
    views: ['asylum', 'origin'],
    caveats: [
      'Derived on the client from the component metrics; a null component is treated as 0 only when at least one component is reported.',
    ],
    derived: true,
    components: ['refugees', 'asylum_seekers', 'idps', 'stateless', 'ooc', 'oip'],
  },
};

export function buildMetrics(): MetricsFile {
  const metrics = {} as Record<AnyMetricId, MetricDef>;
  for (const [id, d] of Object.entries(DEFS) as [AnyMetricId, Omit<MetricDef, 'id'>][])
    metrics[id] = { id, ...d };
  return { schema: 1, metrics };
}
