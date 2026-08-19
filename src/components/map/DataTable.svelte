<script lang="ts">
  /**
   * Dense data table — the complete non-visual equivalent of the choropleth (§8.3 #2, §8.6).
   * All entities, all metrics for the current year/view; sortable; column chooser; download current view.
   */
  import { ui, data, raw, session, selectCountry, prefetchCountry } from '../../lib/state.svelte';
  import type { ViewResult } from '../../lib/view';
  import { METRIC_IDS, type MetricId } from '../../lib/types';
  import { displayName } from '../../lib/data';
  import { fmtInt, fmtRate } from '../../lib/format';
  import { useT, type Locale, type MessageKey } from '../../i18n/ui';
  import { toCsv } from '../../lib/csv';
  import { saveFile } from '../../lib/csv-client';

  let {
    locale,
    view,
    embedded = false,
    ondownload,
  }: { locale: Locale; view: ViewResult; embedded?: boolean; ondownload?: () => void } = $props();
  const tr = $derived(useT(locale));
  type Col = 'rank' | 'name' | 'value' | 'per1k' | 'share' | 'population' | MetricId;
  let sortCol = $state<Col>('rank');
  let sortDir = $state<1 | -1>(1);
  let cols = $state<Set<Col>>(new Set(['rank', 'name', 'value', 'per1k', 'share']));
  let showCols = $state(false);
  const allCols: Col[] = ['rank', 'name', 'value', 'per1k', 'share', 'population', ...METRIC_IDS];

  const rows = $derived.by(() => {
    void data.stockVersion;
    const total = view.total ?? 0;
    const list = view.rows
      .filter((r) => r.meta.in_unhcr || r.meta.in_geo)
      .map((r) => {
        const metrics = Object.fromEntries(
          METRIC_IDS.map((m) => [m, raw.stock.value(ui.v, r.iso3, m, ui.y)]),
        ) as Record<MetricId, number | null>;
        return {
          ...r,
          name: displayName(r.meta, locale),
          population: raw.stock.pop(r.iso3, ui.y),
          share: r.abs !== null && total > 0 ? r.abs / total : null,
          metrics,
        };
      });
    const key = (x: (typeof list)[number]): number | string | null => {
      switch (sortCol) {
        case 'rank':
          return x.rank || 1e9;
        case 'name':
          return x.name;
        case 'value':
          return x.value;
        case 'per1k':
          return x.per1k;
        case 'share':
          return x.share;
        case 'population':
          return x.population;
        default:
          return x.metrics[sortCol];
      }
    };
    list.sort((a, b) => {
      const ka = key(a),
        kb = key(b);
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      if (typeof ka === 'string' && typeof kb === 'string') return ka.localeCompare(kb) * sortDir;
      return ((ka as number) - (kb as number)) * sortDir;
    });
    return list;
  });
  function sortBy(c: Col) {
    if (sortCol === c) sortDir = sortDir === 1 ? -1 : 1;
    else {
      sortCol = c;
      sortDir = c === 'name' || c === 'rank' ? 1 : -1;
    }
  }
  function toggleCol(c: Col) {
    const n = new Set(cols);
    if (n.has(c)) n.delete(c);
    else n.add(c);
    cols = n;
  }
  const label = (c: Col): string => {
    switch (c) {
      case 'rank':
        return tr('table.rank');
      case 'name':
        return tr('table.country');
      case 'value':
        return tr('table.value');
      case 'per1k':
        return tr('scale.per1k');
      case 'share':
        return tr('table.share');
      case 'population':
        return tr('country.population');
      default:
        return tr(`metric.${c}` as MessageKey);
    }
  };
  function downloadCurrent() {
    if (ondownload) return ondownload();
    const visible = allCols.filter((c) => cols.has(c));
    const header = [
      'iso3',
      ...visible.map((c) => (c === 'name' ? 'country_name' : c)),
      'year',
      'view',
      'metric',
      'snapshot_id',
    ];
    const body = rows.map((r) => [
      r.iso3,
      ...visible.map((c) =>
        c === 'rank'
          ? r.rank || null
          : c === 'name'
            ? r.meta.name
            : c === 'value'
              ? r.value
              : c === 'per1k'
                ? r.per1k
                : c === 'share'
                  ? r.share
                  : c === 'population'
                    ? r.population
                    : r.metrics[c],
      ),
      ui.y,
      ui.v,
      ui.m,
      data.manifest?.snapshot_id ?? '',
    ]);
    saveFile(`wtw-table-${ui.v}-${ui.m}-${ui.y}.csv`, toCsv(header, body), 'text/csv');
  }
  const aria = (c: Col) => (sortCol === c ? (sortDir === 1 ? 'ascending' : 'descending') : 'none');
</script>

<div class:table-drawer={!embedded} class="table-wrap">
  <div class="panel-head">
    <span
      >{tr('table.title')} — {tr(`metric.${ui.m}` as MessageKey)} · {ui.y} · {ui.v === 'asylum'
        ? tr('view.asylum')
        : tr('view.origin')}</span
    >
    <span class="muted small">{tr('table.rows', { n: rows.length })}</span>
    <span class="spacer"></span>
    <button
      class="btn ghost"
      type="button"
      aria-expanded={showCols}
      onclick={() => (showCols = !showCols)}>{tr('table.columns')}</button
    >
    <button class="btn ghost" type="button" onclick={downloadCurrent}
      >⬇ {tr('table.download')}</button
    >
    {#if !embedded}<button
        class="btn ghost icon"
        type="button"
        aria-label={tr('table.close')}
        onclick={() => (ui.t = false)}>×</button
      >{/if}
  </div>
  {#if showCols}
    <div class="colpicker small">
      {#each allCols as c (c)}<label
          ><input type="checkbox" checked={cols.has(c)} onchange={() => toggleCol(c)} />
          {label(c)}</label
        >{/each}
    </div>
  {/if}
  <div class="panel-body">
    <table>
      <thead>
        <tr>
          {#each allCols.filter((c) => cols.has(c)) as c (c)}
            <th class:num={c !== 'name'} aria-sort={aria(c)} scope="col"
              ><button
                type="button"
                onclick={() => sortBy(c)}
                title={tr('table.sort', { col: label(c) })}
                >{label(c)}{sortCol === c ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}</button
              ></th
            >
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.iso3)}
          <tr
            class:is-selected={ui.c === r.iso3}
            onclick={() => selectCountry(r.iso3)}
            onmouseenter={() => ((session.hover = r.iso3), prefetchCountry(r.iso3))}
            onmouseleave={() => (session.hover = null)}
          >
            {#each allCols.filter((c) => cols.has(c)) as c (c)}
              {#if c === 'rank'}<td class="num">{r.rank || ''}</td>
              {:else if c === 'name'}<td
                  ><a
                    href={`/country/${r.iso3}`}
                    onclick={(e) => {
                      e.preventDefault();
                      selectCountry(r.iso3);
                    }}>{r.name}</a
                  >{#if !r.drawable}<span class="muted" title={tr('legend.unmappable', { n: 1 })}>
                      ◌</span
                    >{/if}</td
                >
              {:else if c === 'value'}<td class="num"
                  >{ui.n === 'per1k' ? fmtRate(r.value, locale) : fmtInt(r.value, locale)}</td
                >
              {:else if c === 'per1k'}<td class="num">{fmtRate(r.per1k, locale)}</td>
              {:else if c === 'share'}<td class="num"
                  >{r.share === null ? '—' : (r.share * 100).toFixed(2) + '%'}</td
                >
              {:else if c === 'population'}<td class="num">{fmtInt(r.population, locale)}</td>
              {:else}<td class="num">{fmtInt(r.metrics[c], locale)}</td>{/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .table-wrap th button {
    border: 0;
    background: none;
    font: inherit;
    font-weight: 600;
    color: inherit;
    cursor: pointer;
    padding: 0;
  }
  .colpicker {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-bottom: 1px solid var(--c-border);
  }
  tbody tr {
    cursor: pointer;
  }
</style>
