<script lang="ts">
  /**
   * Country page island. Receives the whole CountryFile as a prop (inlined into the HTML at build
   * time → zero data requests on first paint). Year/metric come from the URL (?y=&m=&tab=).
   */
  import { onMount } from 'svelte';
  import type {
    CountryFile,
    SourcesFile,
    MetricsFile,
    AnyMetricId,
    CountryMeta,
    WorldTotalsFile,
  } from '../../lib/types';
  import { METRIC_IDS } from '../../lib/types';
  import { unpack } from '../../lib/columnar';
  import { useT, localizePath, type Locale, type MessageKey } from '../../i18n/ui';
  import { fmtInt, fmtRate, fmtCompact, fmtDateIso } from '../../lib/format';
  import { URL_METRICS } from '../../lib/url';
  import { footnoteMatchesMetric } from '../../lib/data';
  import { buildCitations } from '../../lib/citation';
  import {
    viewRowsToCsv,
    provenanceComments,
    buildJsonExport,
    saveFile,
    safeFilename,
    type ViewExportRow,
  } from '../../lib/csv-client';
  import TimeSeries from '../charts/TimeSeries.svelte';
  import AgeSexPyramid from '../charts/AgeSexPyramid.svelte';
  import TopFlowsBar from '../charts/TopFlowsBar.svelte';
  import SourceNote from '../data/SourceNote.svelte';
  import CopyField from '../ui/CopyField.svelte';
  import Modal from '../ui/Modal.svelte';

  let {
    file,
    sources,
    metrics,
    locale,
    names,
    siteUrl,
    snapshotId,
    worldTotals = null,
  }: {
    file: CountryFile;
    sources: SourcesFile;
    metrics: MetricsFile;
    locale: Locale;
    names: Record<string, string>;
    siteUrl: string;
    snapshotId: string;
    worldTotals?: WorldTotalsFile | null;
  } = $props();
  const tr = $derived(useT(locale));
  const statusLabel = (st: string) => {
    const label = tr(('status.' + st) as MessageKey);
    return label.startsWith('status.') ? st : label;
  };
  const yearMax = $derived(file.years[file.years.length - 1]!);
  const yearMin = $derived(file.years[0]!);
  let year = $state(0);
  let metric = $state<AnyMetricId>('refugees');
  let dialog = $state<null | 'cite' | 'download'>(null);
  let withComments = $state(true); // #12: provenance comments on by default
  const name = $derived(
    locale === 'zh-Hant' && file.meta.display_name_zh
      ? file.meta.display_name_zh
      : file.meta.display_name,
  );
  const countryIndex = $derived(
    new Map<string, CountryMeta>(
      Object.entries(names).map(([iso3, display_name]) => [
        iso3,
        { iso3, display_name } as CountryMeta,
      ]),
    ),
  );

  function readUrl() {
    const p = new URLSearchParams(location.search);
    const y = Number(p.get('y'));
    year = Number.isInteger(y) && y >= yearMin && y <= yearMax ? y : yearMax;
    const m = p.get('m') as AnyMetricId | null;
    metric = m && URL_METRICS.includes(m) ? m : 'refugees';
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (year !== yearMax) p.set('y', String(year));
    if (metric !== 'refugees') p.set('m', metric);
    const q = p.toString();
    history.replaceState(null, '', `${location.pathname}${q ? '?' + q : ''}`);
  }
  onMount(() => {
    readUrl();
    withComments = localStorage.getItem('wtw.csvStrict') !== '1';
    window.addEventListener('popstate', readUrl);
    return () => window.removeEventListener('popstate', readUrl);
  });
  let mounted = $state(false);
  onMount(() => (mounted = true));
  $effect(() => {
    void year;
    void metric;
    if (mounted) writeUrl();
  });

  const yi = $derived(file.years.indexOf(year));
  const val = (view: 'asylum' | 'origin', m: AnyMetricId): number | null => {
    if (yi < 0) return null;
    if (m === 'total_poc') {
      let s: number | null = null;
      for (const c of ['refugees', 'asylum_seekers', 'idps', 'stateless', 'ooc', 'oip'] as const) {
        const v = unpack(file[view].v[METRIC_IDS.indexOf(c)]!)[yi] ?? null;
        if (v !== null) s = (s ?? 0) + v;
      }
      return s;
    }
    return unpack(file[view].v[METRIC_IDS.indexOf(m as (typeof METRIC_IDS)[number])]!)[yi] ?? null;
  };
  const pop = $derived(yi >= 0 ? (unpack(file.population)[yi] ?? null) : null);
  const hosted = $derived(val('asylum', metric));
  const originating = $derived(val('origin', metric));
  /** #14: share of the world total for this metric/year (world-totals.json; null = not computable) */
  const worldShare = (view: 'asylum' | 'origin', v: number | null): string | null => {
    const t = worldTotals?.totals?.[String(year)]?.[metric]?.[view] ?? null;
    if (v === null || !t || t <= 0) return null;
    const pct = (v / t) * 100;
    return pct >= 0.1 ? `${pct.toFixed(1)}%` : pct >= 0.01 ? `${pct.toFixed(2)}%` : '<0.01%';
  };
  const rows = $derived(
    METRIC_IDS.map((m) => ({ m, a: val('asylum', m), o: val('origin', m) })).filter(
      (r) => r.a !== null || r.o !== null,
    ),
  );
  const footnotes = $derived(
    file.footnotes
      .filter((f) => f.year === null || f.year === year)
      .map((f) => ({ ...f, match: footnoteMatchesMetric(f.population_type, metric) }))
      .sort((a, b) => Number(b.match) - Number(a.match)),
  );
  const srcId = $derived(metric === 'idps' ? 'unhcr_idmc' : 'unhcr_population');
  const src = $derived(sources[srcId]);
  const permalink = $derived(
    `${siteUrl}${localizePath(`/country/${file.iso3}`, locale)}${year !== yearMax || metric !== 'refugees' ? `?${year !== yearMax ? `y=${year}` : ''}${year !== yearMax && metric !== 'refugees' ? '&' : ''}${metric !== 'refugees' ? `m=${metric}` : ''}` : ''}`,
  );
  const title = $derived(
    `${name} — ${tr(`metric.${metric}` as MessageKey).toLowerCase()}, ${yearMin}–${yearMax}`,
  );
  const citations = $derived(
    buildCitations({
      locale,
      title,
      url: permalink,
      sources: [src, sources['wpp_population']].filter((s): s is NonNullable<typeof s> => !!s),
      version: snapshotId,
    }),
  );
  const solutionsRow = $derived(file.solutions.find((s) => s.year === year));
  const idmcRow = $derived(file.idmc.find((s) => s.year === year));
  const appsHost = $derived(file.asylum_applications.host.find((a) => a.year === year));
  const appsOrigin = $derived(file.asylum_applications.origin.find((a) => a.year === year));

  function exportRows(): ViewExportRow[] {
    const out: ViewExportRow[] = [];
    const valAt = (view: 'asylum' | 'origin', i: number): number | null => {
      if (metric === 'total_poc') {
        let s: number | null = null;
        for (const c of [
          'refugees',
          'asylum_seekers',
          'idps',
          'stateless',
          'ooc',
          'oip',
        ] as const) {
          const x = unpack(file[view].v[METRIC_IDS.indexOf(c)]!)[i] ?? null;
          if (x !== null) s = (s ?? 0) + x;
        }
        return s;
      }
      return (
        unpack(file[view].v[METRIC_IDS.indexOf(metric as (typeof METRIC_IDS)[number])] ?? [])[i] ??
        null
      );
    };
    file.years.forEach((y, i) => {
      for (const view of ['asylum', 'origin'] as const) {
        const vv = valAt(view, i);
        if (vv === null) continue;
        const p = unpack(file.population)[i] ?? null;
        const prev = i > 0 && file.years[i - 1] === y - 1 ? valAt(view, i - 1) : null;
        out.push({
          iso3: file.iso3,
          country_name: file.meta.name,
          year: y,
          metric,
          view,
          value: vv,
          yoy_delta: prev !== null ? vv - prev : null,
          per_1000: p ? (vv / p) * 1000 : null,
          population: p,
          rank: null,
        });
      }
    });
    return out;
  }
  const prov = () => ({
    source_id: srcId,
    source_attribution: src?.attribution ?? 'UNHCR',
    data_as_of: src?.data_as_of ?? '',
    retrieved_at: src?.retrieved_at ?? '',
    snapshot_id: snapshotId,
  });
  function dlCsv() {
    localStorage.setItem('wtw.csvStrict', withComments ? '0' : '1');
    saveFile(
      `wtw-${safeFilename(title)}.csv`,
      viewRowsToCsv(exportRows(), prov(), {
        comments: withComments ? provenanceComments(prov(), permalink, title) : undefined,
      }),
      'text/csv',
    );
  }
  function dlJson() {
    saveFile(
      `wtw-${safeFilename(title)}.json`,
      JSON.stringify(
        buildJsonExport({
          title,
          permalink,
          snapshotId,
          sources: Object.fromEntries(
            Object.entries(sources).filter(([k]) => file.sources.includes(k)),
          ),
          citations,
          notes: (locale === 'zh-Hant' ? (src?.caveats_zh ?? src?.caveats) : src?.caveats) ?? [],
          data: file,
        }),
        null,
        2,
      ),
      'application/json',
    );
  }
</script>

<div class="country-app">
  <div class="controls no-print">
    <label
      >{tr('common.year')}
      <input
        type="range"
        min={yearMin}
        max={yearMax}
        bind:value={year}
        aria-valuetext={String(year)}
      />
      <span class="num year-label">{year}</span>
    </label>
    <label
      >{tr('common.value')}
      <select bind:value={metric}>
        {#each URL_METRICS as m (m)}<option value={m}>{tr(`metric.${m}` as MessageKey)}</option
          >{/each}
      </select>
    </label>
    <span class="spacer"></span>
    <a class="btn" href={localizePath('/', locale) + `?c=${file.iso3}&y=${year}&m=${metric}`}
      >{tr('country.viewOnMap')} →</a
    >
    <button class="btn" type="button" onclick={() => (dialog = 'cite')}
      >❝ {tr('source.cite')}</button
    >
    <button class="btn primary" type="button" onclick={() => (dialog = 'download')}
      >⬇ {tr('download.title')}</button
    >
  </div>

  <section class="kpis">
    <div class="kpi">
      <div class="label">
        {tr('country.hosted', { name })} · {tr(`metric.${metric}` as MessageKey)}
      </div>
      <div class="value">{fmtInt(hosted, locale)}</div>
      <div class="label">
        {hosted !== null && pop
          ? `${fmtRate((hosted / pop) * 1000, locale)} ${tr('legend.per1k.unit')}`
          : ''}
      </div>
      {#if worldShare('asylum', hosted)}
        <div class="label">
          {tr('country.shareOfWorld', { pct: worldShare('asylum', hosted)! })}
        </div>
      {/if}
    </div>
    <div class="kpi">
      <div class="label">
        {tr('country.originating', { name })} · {tr(`metric.${metric}` as MessageKey)}
      </div>
      <div class="value">{fmtInt(originating, locale)}</div>
      <div class="label">
        {originating !== null && pop
          ? `${fmtRate((originating / pop) * 1000, locale)} ${tr('legend.per1k.unit')}`
          : ''}
      </div>
      {#if worldShare('origin', originating)}
        <div class="label">
          {tr('country.shareOfWorld', { pct: worldShare('origin', originating)! })}
        </div>
      {/if}
    </div>
    <div class="kpi">
      <div class="label">{tr('country.population')} · {year}</div>
      <div class="value">{fmtCompact(pop, locale)}</div>
      <div class="label">UN WPP 2024</div>
    </div>
  </section>
  {#if src}<SourceNote {locale} source={src} sourceId={srcId} />{/if}

  <h2>{tr('country.asOf', { year })}</h2>
  {#if rows.length}
    <table>
      <thead
        ><tr
          ><th>{tr('common.value')}</th><th class="num">{tr('detail.hosting')}</th><th class="num"
            >{tr('detail.origin')}</th
          ></tr
        ></thead
      >
      <tbody
        >{#each rows as r (r.m)}<tr class:is-current={r.m === metric}
            ><td>{tr(`metric.${r.m}` as MessageKey)}</td><td class="num">{fmtInt(r.a, locale)}</td
            ><td class="num">{fmtInt(r.o, locale)}</td></tr
          >{/each}</tbody
      >
    </table>
  {:else}
    <p class="muted">
      {tr('detail.noData')}{file.meta.in_unhcr ? '' : ` — ${tr('country.notInUnhcr')}`}
    </p>
  {/if}
  {#if solutionsRow || idmcRow || appsHost || appsOrigin}
    <div class="grid-2">
      {#if solutionsRow}
        <div class="card small">
          <strong>{tr('country.solutions')} ({year})</strong>
          <ul class="plain">
            <li>
              {tr('metric.returned_refugees')}: {fmtInt(solutionsRow.returned_refugees, locale)}
            </li>
            <li>{tr('solutions.resettlement')}: {fmtInt(solutionsRow.resettlement, locale)}</li>
            <li>{tr('solutions.naturalisation')}: {fmtInt(solutionsRow.naturalisation, locale)}</li>
            <li>{tr('metric.returned_idps')}: {fmtInt(solutionsRow.returned_idps, locale)}</li>
          </ul>
        </div>
      {/if}
      {#if idmcRow}
        <div class="card small">
          <strong>{tr('country.idmc')} ({year})</strong>
          <ul class="plain"><li>{tr('metric.idps')}: {fmtInt(idmcRow.total, locale)}</li></ul>
          {#if sources['unhcr_idmc']}<SourceNote
              {locale}
              source={sources['unhcr_idmc']}
              sourceId="unhcr_idmc"
              compact
            />{/if}
        </div>
      {/if}
      {#if appsHost || appsOrigin}
        <div class="card small">
          <strong>{tr('country.asylumApplications', { year })}</strong>
          <ul class="plain">
            {#if appsHost}<li>
                {tr('country.lodgedIn', { name })}: {fmtInt(appsHost.applied, locale)}
              </li>{/if}{#if appsOrigin}<li>
                {tr('country.byNationals', { name })}: {fmtInt(appsOrigin.applied, locale)}
              </li>{/if}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
  {#if footnotes.length}
    <details class="small">
      <summary>{tr('country.footnotes')} ({footnotes.length})</summary>
      <ul>
        {#each footnotes as f, i (i)}<li>
            <span class="muted"
              >{f.year ?? tr('common.all')} · {f.population_type} · {f.view === 'asylum'
                ? tr('view.asylum.short')
                : tr('view.origin.short')}</span
            >
            — {f.text}
          </li>{/each}
      </ul>
    </details>
  {/if}

  <h2>{tr('country.series', { year: yearMax })}</h2>
  <TimeSeries {file} {locale} {metric} {year} height={280} />
  {#if src}<SourceNote {locale} source={src} sourceId={srcId} compact />{/if}

  <div class="grid-2">
    <section>
      <h2>{tr('country.demographics', { year })}</h2>
      <AgeSexPyramid {file} {locale} {year} />
      {#if sources['unhcr_demographics']}<SourceNote
          {locale}
          source={sources['unhcr_demographics']}
          sourceId="unhcr_demographics"
          compact
        />{/if}
    </section>
    <section>
      <h2>{tr('country.topOrigins')}</h2>
      <TopFlowsBar {file} {locale} {year} view="asylum" {countryIndex} />
      <h2>{tr('country.topHosts')}</h2>
      <TopFlowsBar {file} {locale} {year} view="origin" {countryIndex} />
      {#if sources['unhcr_population']}<SourceNote
          {locale}
          source={sources['unhcr_population']}
          sourceId="unhcr_population"
          compact
        />{/if}
    </section>
  </div>

  <h2>{tr('detail.tab.sources')}</h2>
  <table class="small">
    <thead
      ><tr
        ><th>{tr('common.source')}</th><th>{tr('common.license')}</th><th>{tr('cite.dataAsOf')}</th
        ><th>{tr('cite.retrieved')}</th><th>{tr('common.status')}</th></tr
      ></thead
    >
    <tbody>
      {#each file.sources as sid (sid)}{@const s = sources[sid]}{#if s}
          <tr
            ><td
              ><a href={s.landing_page} rel="noopener" target="_blank">{s.publisher}</a> — {s.title}</td
            ><td>{s.license.id}</td><td>{fmtDateIso(s.data_as_of)}</td><td
              >{fmtDateIso(s.retrieved_at)}</td
            ><td>{statusLabel(s.status)}</td></tr
          >
        {/if}{/each}
    </tbody>
  </table>
  <p class="small muted">
    {tr('source.snapshot', { id: snapshotId })} ·
    <a href={localizePath('/methodology', locale)}>{tr('nav.methodology')}</a>
    · <a href={localizePath('/about/boundaries', locale)}>{tr('nav.boundaries')}</a>
  </p>

  {#if dialog === 'cite'}
    <Modal title={tr('cite.title')} onclose={() => (dialog = null)} closeLabel={tr('common.close')}>
      <p class="small muted">{title}</p>
      <CopyField {locale} label={tr('cite.page')} value={citations.page} mono={false} />
      <CopyField {locale} label={tr('cite.apa')} value={citations.apa} mono={false} rows={2} />
      <CopyField
        {locale}
        label={tr('cite.chicago')}
        value={citations.chicago}
        mono={false}
        rows={2}
      />
      <CopyField {locale} label={tr('cite.bibtex')} value={citations.bibtex} rows={8} />
    </Modal>
  {:else if dialog === 'download'}
    <Modal
      title={tr('download.title')}
      onclose={() => (dialog = null)}
      closeLabel={tr('common.close')}
    >
      <p class="small muted">{title}</p>
      <div class="dl-actions">
        <button class="btn primary" type="button" onclick={dlCsv}>⬇ {tr('download.csv')}</button
        ><button class="btn" type="button" onclick={dlJson}
          >⬇ {tr('download.json')} ({tr('common.all')})</button
        >
      </div>
      <label class="small check"
        ><input type="checkbox" bind:checked={withComments} /> {tr('download.comments')}</label
      >
      <p class="small muted">
        {tr('download.license', {
          license: src?.license.id ?? 'CC BY 4.0',
          attribution: src?.attribution ?? 'UNHCR',
        })}
      </p>
    </Modal>
  {/if}
</div>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-4);
    padding: var(--sp-3);
    background: var(--c-surface-2);
    border-radius: var(--radius);
    font-size: var(--fs-sm);
  }
  .controls label {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .controls input[type='range'] {
    width: 220px;
    accent-color: var(--c-primary);
  }
  .controls select {
    border: 1px solid var(--c-border-strong);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    min-height: 32px;
    background: var(--c-surface);
  }
  .year-label {
    font-weight: 700;
    font-size: var(--fs-lg);
  }
  .spacer {
    flex: 1;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--sp-3);
  }
  .kpi .value {
    font-size: var(--fs-2xl);
  }
  tr.is-current td {
    font-weight: 600;
    background: var(--c-primary-soft);
  }
  ul.plain {
    list-style: none;
    padding: 0;
    margin: 4px 0 0;
  }
  .dl-actions {
    display: flex;
    gap: var(--sp-2);
    margin: var(--sp-3) 0;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: var(--sp-3);
  }
</style>
