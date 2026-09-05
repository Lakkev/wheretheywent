/**
 * Which sources actually stand behind a figure on screen.
 *
 * Every page used to pick one source with the same inline rule — `metric === 'idps' ?
 * 'unhcr_idmc' : 'unhcr_population'` — written out in three components. That is right for the
 * nine plain metrics and wrong for the derived one: total_poc contains IDMC's IDP series, so the
 * citation dialog, the source note and the CSV provenance columns all credited UNHCR alone for a
 * number that is partly IDMC's. Per-1,000 views additionally rest on UN WPP.
 *
 * Resolution is data-driven: metrics.json already publishes `components` for derived metrics, so
 * downstream users reading the same file reach the same answer we display.
 */
import { metricInView, type AnyMetricId, type MetricsFile, type SourceEntry, type ViewId } from './types';

export const POPULATION_SOURCE_ID = 'wpp_population';

/**
 * Source ids behind `metric` in `view`, in stable order (component order, population last).
 * `norm === 'per1k'` adds the WPP denominator.
 */
export function sourceIdsFor(
  metric: AnyMetricId,
  view: ViewId,
  norm: 'abs' | 'per1k',
  metrics: MetricsFile | null,
): string[] {
  const out: string[] = [];
  const push = (id: string | undefined) => {
    if (id && !out.includes(id)) out.push(id);
  };
  const def = metrics?.metrics?.[metric];
  const components = def?.components;
  if (components?.length) {
    // Only the components that exist in this view contribute, for the same reason the sum does.
    for (const c of components) {
      if (metricInView(c, view)) push(metrics?.metrics?.[c]?.source_id);
    }
  }
  // Fall back to the metric's own source_id: plain metrics, and derived ones if metrics.json is
  // unavailable (it is fetched, so a page can render before it lands).
  if (!out.length) push(def?.source_id ?? (metric === 'idps' ? 'unhcr_idmc' : 'unhcr_population'));
  if (norm === 'per1k') push(POPULATION_SOURCE_ID);
  return out;
}

/** The same resolution, mapped to loaded source entries; unknown ids are dropped. */
export function sourcesFor(
  metric: AnyMetricId,
  view: ViewId,
  norm: 'abs' | 'per1k',
  metrics: MetricsFile | null,
  sources: Record<string, SourceEntry> | null | undefined,
): { id: string; entry: SourceEntry }[] {
  if (!sources) return [];
  return sourceIdsFor(metric, view, norm, metrics)
    .map((id) => ({ id, entry: sources[id]! }))
    .filter((s) => !!s.entry);
}

/**
 * Provenance for a CSV/JSON export of a derived metric. Multi-source values are joined so the
 * columns stay single-valued for naive parsers; the separators are documented in
 * docs/DATA-DICTIONARY.md and are chosen not to occur inside an id or an attribution string.
 */
export const SOURCE_ID_SEPARATOR = '+';
export const ATTRIBUTION_SEPARATOR = ' · ';

type Resolved = { id: string; entry: SourceEntry };

export function joinSourceIds(rs: Resolved[]): string {
  return rs.map((r) => r.id).join(SOURCE_ID_SEPARATOR);
}

export function joinAttributions(rs: Resolved[]): string {
  return rs.map((r) => r.entry.attribution).join(ATTRIBUTION_SEPARATOR);
}

/** Oldest `data_as_of`: a combined figure is only as current as its stalest part. */
export function earliestAsOf(rs: Resolved[]): string {
  return rs.map((r) => r.entry.data_as_of).sort()[0] ?? '';
}

/** Newest `retrieved_at`: when this combination was last assembled. */
export function latestRetrievedAt(rs: Resolved[]): string {
  return rs
    .map((r) => r.entry.retrieved_at)
    .sort()
    .slice(-1)[0] ?? '';
}
