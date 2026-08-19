<script lang="ts">
  /** /compare island: 2–3 countries side by side for one metric (?cmp=A,B,C&m=&y=&v=). */
  import { onMount } from 'svelte';
  import type {
    CountryFile,
    CountriesFile,
    SourcesFile,
    AnyMetricId,
    ViewId,
  } from '../../lib/types';
  import { METRIC_IDS } from '../../lib/types';
  import { DataClient, displayName, indexCountries } from '../../lib/data';
  import { unpack } from '../../lib/columnar';
  import { useT, localizePath, type Locale, type MessageKey } from '../../i18n/ui';
  import { fmtInt, fmtRate } from '../../lib/format';
  import { URL_METRICS, MAX_COMPARE } from '../../lib/url';
  import { loadPlot, segments, PLOT_STYLE } from '../charts/plot-helpers';
  import { buildCitations } from '../../lib/citation';
  import {
    viewRowsToCsv,
    provenanceComments,
    saveFile,
    safeFilename,
    type ViewExportRow,
  } from '../../lib/csv-client';
  import SourceNote from '../data/SourceNote.svelte';
  import CopyField from '../ui/CopyField.svelte';
  import Modal from '../ui/Modal.svelte';

  let { locale, siteUrl }: { locale: Locale; siteUrl: string } = $props();
  const tr = $derived(useT(locale));
  const client = new DataClient();
  let countries = $state<CountriesFile | null>(null);
  let sources = $state<SourcesFile>({});
  let files = $state<CountryFile[]>([]);
  let cmp = $state<string[]>([]);
  let metric = $state<AnyMetricId>('refugees');
  let view = $state<ViewId>('asylum');
  let year = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let dialog = $state<null | 'cite' | 'download'>(null);
  let query = $state('');
  let plotEl: HTMLDivElement;
  const COLORS = ['#08519c', '#4292c6', '#9ecae1'];
  const idx = $derived(countries ? indexCountries(countries) : new Map());
  const yearMax = $derived(files[0]?.years[files[0].years.length - 1] ?? 2025);
  const yearMin = $derived(files[0]?.years[0] ?? 1951);

  function readUrl() {
    const p = new URLSearchParams(location.search);
    cmp = [
      ...new Set(
        (p.get('cmp') ?? '')
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => /^[A-Z0-9_]{3,4}$/.test(s)),
      ),
    ].slice(0, MAX_COMPARE);
    const m = p.get('m') as AnyMetricId | null;
    metric = m && URL_METRICS.includes(m) ? m : 'refugees';
    view = p.get('v') === 'origin' ? 'origin' : 'asylum';
    const y = Number(p.get('y'));
    year = Number.isInteger(y) && y > 1900 ? y : 0;
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (cmp.length) p.set('cmp', [...cmp].sort().join(','));
    if (metric !== 'refugees') p.set('m', metric);
    if (view !== 'asylum') p.set('v', view);
    if (year && year !== yearMax) p.set('y', String(year));
    history.replaceState(
      null,
      '',
      `${location.pathname}${p.toString() ? '?' + p.toString().replace(/%2C/g, ',') : ''}`,
    );
  }
  async function load() {
    loading = true;
    try {
      if (!client.manifest) await client.loadManifest();
      if (!countries)
        [countries, sources] = await Promise.all([client.countries(), client.sources()]);
      files = (await Promise.all(cmp.map((c) => client.country(c).catch(() => null)))).filter(
        (f): f is CountryFile => !!f,
      );
      cmp = files.map((f) => f.iso3);
      if (!year) year = yearMax;
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    readUrl();
    void load();
    const pop = () => {
      readUrl();
      void load();
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  });
  let mounted = false;
  onMount(() => (mounted = true));
  $effect(() => {
    void cmp;
    void metric;
    void view;
    void year;
    if (mounted && !loading) writeUrl();
  });
  function add(iso3: string) {
    if (cmp.includes(iso3) || cmp.length >= MAX_COMPARE) return;
    cmp = [...cmp, iso3];
    query = '';
    void load();
  }
  function remove(iso3: string) {
    cmp = cmp.filter((c) => c !== iso3);
    void load();
  }
  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q || !countries) return [];
    return countries.countries
      .filter(
        (c) =>
          c.in_unhcr &&
          !cmp.includes(c.iso3) &&
          (displayName(c, locale).toLowerCase().includes(q) || c.iso3.toLowerCase() === q),
      )
      .slice(0, 8);
  });

  const valueAt = (f: CountryFile, v: ViewId, m: AnyMetricId, yi: number): number | null => {
    if (yi < 0) return null;
    if (m === 'total_poc') {
      let s: number | null = null;
      for (const c of ['refugees', 'asylum_seekers', 'idps', 'stateless', 'ooc', 'oip'] as const) {
        const x = unpack(f[v].v[METRIC_IDS.indexOf(c)]!)[yi] ?? null;
        if (x !== null) s = (s ?? 0) + x;
      }
      return s;
    }
    return unpack(f[v].v[METRIC_IDS.indexOf(m as (typeof METRIC_IDS)[number])]!)[yi] ?? null;
  };
  const rows = $derived(
    files.map((f, i) => {
      const yi = f.years.indexOf(year);
      const pop = yi >= 0 ? (unpack(f.population)[yi] ?? null) : null;
      const a = valueAt(f, 'asylum', metric, yi);
      const o = valueAt(f, 'origin', metric, yi);
      return {
        f,
        i,
        name: displayName(idx.get(f.iso3), locale, f.iso3),
        pop,
        a,
        o,
        aRate: a !== null && pop ? (a / pop) * 1000 : null,
        oRate: o !== null && pop ? (o / pop) * 1000 : null,
      };
    }),
  );
  const srcId = $derived(metric === 'idps' ? 'unhcr_idmc' : 'unhcr_population');
  const src = $derived(sources[srcId]);
  const title = $derived(
    `${rows.map((r) => r.name).join(' vs ')} — ${tr(`metric.${metric}` as MessageKey).toLowerCase()} (${view === 'asylum' ? tr('view.asylum') : tr('view.origin')}), ${yearMin}–${yearMax}`,
  );
  const permalink = $derived(
    typeof location !== 'undefined' ? `${siteUrl}${location.pathname}${location.search}` : '',
  );
  const citations = $derived(
    buildCitations({ locale, title, url: permalink, sources: src ? [src] : [] }),
  );

  $effect(() => {
    const fs = files;
    const m = metric;
    const v = view;
    const y = year;
    const el = plotEl;
    if (!el || !fs.length) return;
    let cancelled = false;
    loadPlot().then((Plot) => {
      if (cancelled) return;
      el.replaceChildren();
      const pts = fs.flatMap((f, i) =>
        f.years.map((yr, yi) => ({
          year: yr,
          value: valueAt(f, v, m, yi),
          name: displayName(idx.get(f.iso3), locale, f.iso3),
          i,
        })),
      );
      const marks: unknown[] = [Plot.ruleY([0])];
      for (let i = 0; i < fs.length; i++)
        for (const seg of segments(pts.filter((p) => p.i === i)))
          marks.push(Plot.line(seg, { x: 'year', y: 'value', stroke: COLORS[i], strokeWidth: 2 }));
      if (y) marks.push(Plot.ruleX([y], { stroke: '#0b3a6e', strokeOpacity: 0.4 }));
      marks.push(
        Plot.tip(
          pts.filter((p) => p.value !== null),
          Plot.pointerX({
            x: 'year',
            y: 'value',
            title: (d: { year: number; value: number; name: string }) =>
              `${d.name} · ${d.year}\n${fmtInt(d.value, locale)}`,
          }),
        ),
      );
      el.append(
        Plot.plot({
          height: 320,
          width: el.clientWidth || 800,
          marginLeft: 56,
          style: PLOT_STYLE,
          x: { label: tr('common.year'), tickFormat: (d: number) => String(d) },
          y: { label: tr(`metric.${m}` as MessageKey), grid: true, tickFormat: 's' },
          marks,
        }) as SVGSVGElement,
      );
    });
    return () => {
      cancelled = true;
    };
  });
  function dlCsv() {
    const out: ViewExportRow[] = [];
    for (const f of files)
      f.years.forEach((yr, yi) => {
        const v = valueAt(f, view, metric, yi);
        if (v === null) return;
        const pop = unpack(f.population)[yi] ?? null;
        out.push({
          iso3: f.iso3,
          country_name: f.meta.name,
          year: yr,
          metric,
          view,
          value: v,
          per_1000: pop ? (v / pop) * 1000 : null,
          population: pop,
          rank: null,
        });
      });
    const prov = {
      source_id: srcId,
      source_attribution: src?.attribution ?? 'UNHCR',
      data_as_of: src?.data_as_of ?? '',
      retrieved_at: src?.retrieved_at ?? '',
      snapshot_id: client.manifest?.snapshot_id ?? '',
    };
    const withComments = localStorage.getItem('wtw.csvComments') === '1';
    saveFile(
      `wtw-compare-${safeFilename(cmp.join('-'))}-${metric}.csv`,
      viewRowsToCsv(out, prov, {
        comments: withComments ? provenanceComments(prov, permalink, title) : undefined,
      }),
      'text/csv',
    );
  }
</script>

<div class="compare-app">
  <div class="controls">
    <div class="chips">
      {#each rows as r (r.f.iso3)}
        <span class="chip big" style="border-color:{COLORS[r.i]}"
          ><i class="dot" style="background:{COLORS[r.i]}"></i><a
            href={localizePath(`/country/${r.f.iso3}`, locale)}>{r.name}</a
          ><button
            type="button"
            class="x"
            aria-label={tr('detail.removeCompare')}
            onclick={() => remove(r.f.iso3)}>×</button
          ></span
        >
      {/each}
      {#if cmp.length < MAX_COMPARE}
        <span class="adder">
          <input
            type="search"
            placeholder={tr('compare.add')}
            bind:value={query}
            aria-label={tr('compare.add')}
          />
          {#if matches.length}<ul class="results" role="listbox">
              {#each matches as c (c.iso3)}<li
                  role="option"
                  aria-selected="false"
                  tabindex="0"
                  onclick={() => add(c.iso3)}
                  onkeydown={(e) => e.key === 'Enter' && add(c.iso3)}
                >
                  {displayName(c, locale)} <span class="muted">{c.iso3}</span>
                </li>{/each}
            </ul>{/if}
        </span>
      {/if}
    </div>
    <label
      >{tr('common.value')}<select bind:value={metric}
        >{#each URL_METRICS as m (m)}<option value={m}>{tr(`metric.${m}` as MessageKey)}</option
          >{/each}</select
      ></label
    >
    <span class="seg"
      ><button
        class="btn"
        type="button"
        aria-pressed={view === 'asylum'}
        onclick={() => (view = 'asylum')}>{tr('view.asylum')}</button
      ><button
        class="btn"
        type="button"
        aria-pressed={view === 'origin'}
        onclick={() => (view = 'origin')}>{tr('view.origin')}</button
      ></span
    >
    <label
      >{tr('common.year')}<input type="range" min={yearMin} max={yearMax} bind:value={year} />
      <span class="num"><strong>{year}</strong></span></label
    >
    <span class="spacer"></span>
    <button class="btn" type="button" onclick={() => (dialog = 'cite')} disabled={!files.length}
      >❝ {tr('source.cite')}</button
    >
    <button class="btn primary" type="button" onclick={dlCsv} disabled={!files.length}
      >⬇ {tr('download.csv')}</button
    >
  </div>

  {#if error}<p class="callout">{error}</p>{/if}
  {#if loading && !files.length}<p class="muted">{tr('common.loading')}</p>{/if}
  {#if !loading && !files.length}<p class="muted">{tr('compare.empty')}</p>{/if}

  {#if files.length}
    <table>
      <thead
        ><tr
          ><th>{tr('common.country')}</th><th class="num">{tr('detail.hosting')}</th><th class="num"
            >{tr('legend.per1k.unit')}</th
          ><th class="num">{tr('detail.origin')}</th><th class="num">{tr('legend.per1k.unit')}</th
          ><th class="num">{tr('country.population')}</th></tr
        ></thead
      >
      <tbody>
        {#each rows as r (r.f.iso3)}
          <tr
            ><td><i class="dot" style="background:{COLORS[r.i]}"></i> {r.name}</td><td class="num"
              >{fmtInt(r.a, locale)}</td
            ><td class="num">{fmtRate(r.aRate, locale)}</td><td class="num"
              >{fmtInt(r.o, locale)}</td
            ><td class="num">{fmtRate(r.oRate, locale)}</td><td class="num"
              >{fmtInt(r.pop, locale)}</td
            ></tr
          >
        {/each}
      </tbody>
    </table>
    <figure class="chart">
      <div bind:this={plotEl} class="plot" role="img" aria-label={tr('detail.tab.series')}></div>
    </figure>
    {#if src}<SourceNote {locale} source={src} sourceId={srcId} />{/if}
  {/if}

  {#if dialog === 'cite'}
    <Modal title={tr('cite.title')} onclose={() => (dialog = null)}>
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
  {/if}
</div>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3);
    background: var(--c-surface-2);
    border-radius: var(--radius);
    margin-bottom: var(--sp-4);
    font-size: var(--fs-sm);
  }
  .controls label {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .controls select,
  .controls input[type='search'] {
    border: 1px solid var(--c-border-strong);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    min-height: 32px;
    background: var(--c-surface);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    align-items: center;
  }
  .chip.big {
    font-size: var(--fs-sm);
    padding: 4px 8px;
    background: var(--c-surface);
    border-width: 2px;
  }
  .chip .x {
    border: 0;
    background: none;
    cursor: pointer;
    font-size: var(--fs-md);
    line-height: 1;
    padding: 0 2px;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 4px;
  }
  .adder {
    position: relative;
  }
  .results {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 10;
    list-style: none;
    margin: 2px 0 0;
    padding: 4px;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-2);
    min-width: 240px;
  }
  .results li {
    padding: 4px 6px;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .results li:hover {
    background: var(--c-primary-soft);
  }
  .spacer {
    flex: 1;
  }
  .plot {
    width: 100%;
  }
</style>
