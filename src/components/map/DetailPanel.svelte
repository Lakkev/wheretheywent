<script lang="ts">
  import { ui, data, session, raw, toggleCompare, selectCountry } from '../../lib/state.svelte';
  import type { ViewResult } from '../../lib/view';
  import { displayName, footnoteMatchesMetric } from '../../lib/data';
  import { fmtInt, fmtRate, fmtCompact } from '../../lib/format';
  import { useT, localizePath, type Locale, type MessageKey } from '../../i18n/ui';
  import { TABS, type Tab } from '../../lib/url';
  import { METRIC_IDS } from '../../lib/types';
  import SourceNote from '../data/SourceNote.svelte';
  import TimeSeries from '../charts/TimeSeries.svelte';
  import AgeSexPyramid from '../charts/AgeSexPyramid.svelte';
  import TopFlowsBar from '../charts/TopFlowsBar.svelte';
  import { unpack } from '../../lib/columnar';

  let {
    locale,
    view,
    oncite,
    ondownload,
  }: { locale: Locale; view: ViewResult; oncite: () => void; ondownload: () => void } = $props();
  const tr = $derived(useT(locale));
  const iso3 = $derived(ui.c);
  const meta = $derived(iso3 ? raw.countryIndex.get(iso3) : undefined);
  const row = $derived(iso3 ? view.byIso.get(iso3) : undefined);
  const file = $derived(
    session.detailCountry && session.detailCountry.iso3 === iso3 ? session.detailCountry : null,
  );
  const name = $derived(displayName(meta, locale, iso3 ?? ''));
  const inCompare = $derived(iso3 ? ui.cmp.includes(iso3) : false);
  const pop = $derived(iso3 ? raw.stock.pop(iso3, ui.y) : null);
  const src = $derived(data.sources?.[ui.m === 'idps' ? 'unhcr_idmc' : 'unhcr_population']);
  const tabs: Tab[] = [...TABS];
  const note = $derived(
    meta ? (locale === 'zh-Hant' && meta.note_zh ? meta.note_zh : meta.note) : undefined,
  );

  const kpi = $derived.by(() => {
    if (!iso3) return [];
    void data.stockVersion;
    const y = ui.y;
    const out: { label: string; value: string; sub?: string }[] = [];
    const a = raw.stock.value('asylum', iso3, ui.m, y);
    const o = raw.stock.value('origin', iso3, ui.m, y);
    out.push({
      label: `${tr('detail.hosting')} · ${tr(`metric.${ui.m}` as MessageKey)}`,
      value: fmtInt(a, locale),
      sub:
        a !== null && pop
          ? `${fmtRate((a / pop) * 1000, locale)} ${tr('legend.per1k.unit')}`
          : undefined,
    });
    out.push({
      label: `${tr('detail.origin')} · ${tr(`metric.${ui.m}` as MessageKey)}`,
      value: fmtInt(o, locale),
      sub:
        o !== null && pop
          ? `${fmtRate((o / pop) * 1000, locale)} ${tr('legend.per1k.unit')}`
          : undefined,
    });
    return out;
  });
  // full metric table for the selected year from the country file (all metrics, both views)
  const metricRows = $derived.by(() => {
    if (!file) return [];
    const yi = file.years.indexOf(ui.y);
    if (yi < 0) return [];
    return METRIC_IDS.map((m, mi) => ({
      m,
      a: unpack(file.asylum.v[mi]!)[yi] ?? null,
      o: unpack(file.origin.v[mi]!)[yi] ?? null,
    })).filter((r) => r.a !== null || r.o !== null);
  });
  const footnotes = $derived.by(() => {
    if (!file) return [];
    // §10.5: keyed by (country, year, population_type) — current-metric footnotes first
    return file.footnotes
      .filter((f) => f.year === null || f.year === ui.y)
      .map((f) => ({ ...f, match: footnoteMatchesMetric(f.population_type, ui.m) }))
      .sort((a, b) => Number(b.match) - Number(a.match));
  });
</script>

{#if iso3}
  <section class="detail panel" aria-label={name}>
    <div class="panel-head">
      <h2 class="title">{name}</h2>
      <span class="spacer"></span>
      <button
        class="btn ghost icon"
        type="button"
        aria-pressed={inCompare}
        title={inCompare ? tr('detail.removeCompare') : tr('detail.compare')}
        onclick={() => toggleCompare(iso3)}>{inCompare ? '✓' : '+'}</button
      >
      <button
        class="btn ghost icon"
        type="button"
        aria-label={tr('detail.close')}
        onclick={() => selectCountry(null)}>×</button
      >
    </div>
    <div class="tabs" role="tablist">
      {#each tabs as t (t)}
        <button role="tab" type="button" aria-selected={ui.tab === t} onclick={() => (ui.tab = t)}
          >{tr(`detail.tab.${t}` as MessageKey)}</button
        >
      {/each}
    </div>
    <div class="panel-body" role="tabpanel">
      {#if meta && meta.name !== meta.display_name}
        <p class="muted small">{tr('detail.nameNote', { source: 'UNHCR' })}: {meta.name}</p>
      {/if}
      {#if note}<p class="callout small">{note}</p>{/if}

      {#if ui.tab === 'overview'}
        <div class="kpis">
          {#each kpi as k (k.label)}
            <div class="kpi">
              <div class="label">{k.label}</div>
              <div class="value">{k.value}</div>
              {#if k.sub}<div class="label">{k.sub}</div>{/if}
            </div>
          {/each}
        </div>
        <p class="muted small">
          {tr('country.asOf', { year: ui.y })} · {tr('detail.population')}: {fmtCompact(
            pop,
            locale,
          )}
        </p>
        {#if session.detailLoading && !file}<p class="muted">{tr('detail.loading')}</p>{/if}
        {#if metricRows.length}
          <table class="metrics">
            <thead
              ><tr
                ><th>{tr('common.value')}</th><th class="num">{tr('detail.hosting')}</th><th
                  class="num">{tr('detail.origin')}</th
                ></tr
              ></thead
            >
            <tbody>
              {#each metricRows as r (r.m)}
                <tr class:is-current={r.m === ui.m}
                  ><td>{tr(`metric.${r.m}` as MessageKey)}</td><td class="num"
                    >{fmtInt(r.a, locale)}</td
                  ><td class="num">{fmtInt(r.o, locale)}</td></tr
                >
              {/each}
            </tbody>
          </table>
        {/if}
        {#if footnotes.length}
          <details class="small">
            <summary>{tr('country.footnotes')} ({footnotes.length})</summary>
            <ul>
              {#each footnotes as f, i (i)}<li class:fn-match={f.match}>
                  <span class="muted">{f.year ?? tr('common.all')} · {f.population_type}</span>
                  {f.text}
                </li>{/each}
            </ul>
          </details>
        {/if}
      {:else if ui.tab === 'series'}
        {#if file}<TimeSeries {file} {locale} metric={ui.m} year={ui.y} />{:else}<p class="muted">
            {tr('detail.loading')}
          </p>{/if}
      {:else if ui.tab === 'demographics'}
        {#if file}<AgeSexPyramid {file} {locale} year={ui.y} />{:else}<p class="muted">
            {tr('detail.loading')}
          </p>{/if}
      {:else if ui.tab === 'flows'}
        {#if file}<TopFlowsBar {file} {locale} year={ui.y} view={ui.v} />{:else}<p class="muted">
            {tr('detail.loading')}
          </p>{/if}
      {:else if ui.tab === 'sources'}
        {#if data.sources}
          {#each file?.sources ?? ['unhcr_population'] as sid (sid)}
            {@const s = data.sources[sid]}
            {#if s}
              <div class="src small">
                <strong>{s.publisher}</strong> — {s.title}<br />
                <span class="muted"
                  >{tr('cite.dataAsOf')}
                  {s.data_as_of} · {tr('cite.retrieved')}
                  {s.retrieved_at.slice(0, 10)} · {s.license.id}</span
                >
                {#if s.status !== 'ok'}<span class="chip stale">{s.status}</span>{/if}
                {#if (locale === 'zh-Hant' && s.caveats_zh ? s.caveats_zh : s.caveats).length}
                  <ul class="muted">
                    {#each locale === 'zh-Hant' && s.caveats_zh ? s.caveats_zh : s.caveats as c, i (i)}<li
                      >
                        {c}
                      </li>{/each}
                  </ul>
                {/if}
              </div>
            {/if}
          {/each}
        {/if}
      {/if}

      <div class="actions">
        <a class="btn" href={localizePath(`/country/${iso3}`, locale) + `?y=${ui.y}&m=${ui.m}`}
          >{tr('detail.open')} →</a
        >
        <button class="btn ghost" type="button" onclick={oncite}>❝ {tr('source.cite')}</button>
        <button class="btn ghost" type="button" onclick={ondownload}
          >⬇ {tr('download.title')}</button
        >
      </div>
      {#if src}<SourceNote
          {locale}
          source={src}
          sourceId={ui.m === 'idps' ? 'unhcr_idmc' : 'unhcr_population'}
        />{/if}
    </div>
  </section>
{/if}

<style>
  .title {
    font-size: var(--fs-md);
    margin: 0;
  }
  table.metrics td,
  table.metrics th {
    padding: 3px 6px;
  }
  tr.is-current td {
    font-weight: 600;
    background: var(--c-primary-soft);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: var(--sp-3) 0;
  }
  details ul {
    padding-left: 1rem;
  }
  li.fn-match {
    font-weight: 600;
  }
  .src {
    margin-bottom: var(--sp-3);
  }
  .src ul {
    padding-left: 1rem;
    margin: 4px 0 0;
  }
</style>
