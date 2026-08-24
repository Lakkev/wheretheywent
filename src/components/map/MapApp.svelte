<script lang="ts">
  /**
   * ★ The single root island of the map page (client:only="svelte").
   * Owns: URL ⇄ state sync, data loading, keyboard shortcuts, layout of all floating panels.
   */
  import { onMount, untrack } from 'svelte';
  import type { Locale } from '../../i18n/ui';
  import { useT, type MessageKey } from '../../i18n/ui';
  import {
    ui,
    data,
    raw,
    session,
    loadCore,
    loadGeo,
    loadHistory,
    loadLive,
    loadDetail,
    prefetchCountry,
    applyState,
    snapshot,
    setYear,
    toggleCompare,
    toast,
    selectCountry,
  } from '../../lib/state.svelte';
  import {
    decodeState,
    encodeState,
    diffKeys,
    CONTINUOUS_KEYS,
    type MapState,
    type MapPos,
  } from '../../lib/url';
  import { computeView, type ViewResult } from '../../lib/view';
  import { hasWebGL2 } from '../../lib/webgl';
  import { onIdle, footnoteMatchesMetric, metricCaveats as metricCaveatsFor } from '../../lib/data';
  import TopBar from './TopBar.svelte';
  import FilterRail from './FilterRail.svelte';
  import Legend from './Legend.svelte';
  import Timeline from './Timeline.svelte';
  import DetailPanel from './DetailPanel.svelte';
  import MapCanvas from './MapCanvas.svelte';
  import NoWebGLFallback from './NoWebGLFallback.svelte';
  import AttributionBar from './AttributionBar.svelte';
  import NowcastCard from './NowcastCard.svelte';
  import Toasts from '../ui/Toasts.svelte';

  let {
    locale,
    styleUrl,
    yearMin,
    yearMax,
  }: {
    locale: Locale;
    styleUrl: string;
    yearMin: number;
    yearMax: number;
    snapshotId: string | null;
  } = $props();
  const tr = $derived(useT(locale));

  let ready = $state(false);
  let webgl = $state(true);
  let searchEl = $state<HTMLInputElement | undefined>(undefined);
  let mapRef = $state<MapCanvas | undefined>(undefined);
  let timelineRef = $state<Timeline | undefined>(undefined);
  let urlPos = $state<MapPos | null>(null);
  // F6: IDU sub-toggles. Conflict on by default; disasters off — the annual IDP stock shown in
  // colour excludes disasters, so mixing them silently would misrepresent the coloured layer.
  let evConflict = $state(true);
  let evDisaster = $state(false);
  /** Phase 2: flow arcs — full set for the selected country (f=1), light top-5 preview on hover. */
  const FLOWS_FROM = 2015;
  type FlowArc = {
    from: [number, number];
    to: [number, number];
    value: number;
    width: number;
    preview?: 1;
  };
  function buildArcs(
    ff: import('../../lib/types').FlowsFile,
    iso3: string,
    v: 'asylum' | 'origin',
    topN: number,
    widthScale: number,
    preview?: 1,
  ): FlowArc[] {
    const sel = raw.countryIndex.get(iso3)?.centroid;
    if (!sel) return [];
    const top = ff.rows
      .filter((r) => (v === 'asylum' ? r[1] === iso3 : r[0] === iso3))
      .map((r) => ({ partner: v === 'asylum' ? r[0] : r[1], value: (r[2] ?? 0) + (r[3] ?? 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);
    const max = top[0]?.value ?? 1;
    return top.flatMap((x) => {
      const c = raw.countryIndex.get(x.partner)?.centroid;
      if (!c) return [];
      // arcs always run origin → asylum (the direction people moved)
      const from = v === 'asylum' ? c : sel;
      const to = v === 'asylum' ? sel : c;
      return [
        {
          from,
          to,
          value: x.value,
          width: (1.5 + 6.5 * Math.sqrt(x.value / max)) * widthScale,
          ...(preview ? { preview } : {}),
        },
      ];
    });
  }
  let flowArcs = $state<FlowArc[] | null>(null);
  $effect(() => {
    const iso3 = ui.c;
    const y = ui.y;
    const v = ui.v;
    const on = ui.f;
    const haveCountries = !!data.countriesFile; // rerun once centroids exist
    if (!on || !iso3 || y < FLOWS_FROM || !haveCountries) {
      flowArcs = null;
      return;
    }
    let cancelled = false;
    raw.client
      .flows(y)
      .then((ff) => {
        if (!cancelled) flowArcs = buildArcs(ff, iso3, v, 10, 1);
      })
      .catch(() => (flowArcs = null));
    return () => {
      cancelled = true;
    };
  });
  /** Hover intent (400 ms): a light top-5 preview for the hovered country — point at a country
   *  and see where its people went / came from, without selecting. Selection arcs win. */
  let previewArcs = $state<FlowArc[] | null>(null);
  let hoverArcTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const h = session.hover;
    const y = ui.y;
    const v = ui.v;
    const haveCountries = !!data.countriesFile;
    if (hoverArcTimer) clearTimeout(hoverArcTimer);
    if (!h || y < FLOWS_FROM || !haveCountries || h === ui.c || (ui.f && ui.c)) {
      previewArcs = null;
      return;
    }
    hoverArcTimer = setTimeout(() => {
      raw.client
        .flows(y)
        .then((ff) => {
          if (session.hover !== h) return;
          previewArcs = buildArcs(ff, h, v, 5, 0.6, 1);
        })
        .catch(() => {});
    }, 400);
    return () => {
      if (hoverArcTimer) clearTimeout(hoverArcTimer);
    };
  });
  const mapFlowArcs = $derived(flowArcs ?? previewArcs);

  const ctx = () => ({
    yearMin: data.yearMin,
    yearMax: data.yearMax,
    knownIso: raw.knownIso.size ? raw.knownIso : undefined,
    knownRegions: raw.knownRegions.size ? raw.knownRegions : undefined,
  });

  // ---------- derived view (shared by map, rail, legend, table, detail) ----------
  const view: ViewResult = $derived.by(() => {
    void data.stockVersion;
    const countries = data.countriesFile?.countries ?? [];
    return computeView(
      {
        year: ui.y,
        metric: ui.m,
        view: ui.v,
        norm: ui.n,
        scale: ui.sc,
        regions: ui.r,
        min: ui.min,
        breakYears: raw.stock.years,
      },
      raw.stock,
      countries,
    );
  });
  const permalink = $derived.by(() => {
    if (typeof location === 'undefined') return '';
    let q = encodeState(snapshot(), ctx());
    // pin the year in shared/cited links: yearMax advances every year (#audit F3)
    if (!/[?&]y=/.test(q)) q = q ? `${q}&y=${ui.y}` : `?y=${ui.y}`;
    return `${location.origin}${location.pathname}${q}`;
  });

  // ---------- URL sync ----------
  let lastState: MapState | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  function syncUrl(push: boolean) {
    const q = encodeState(snapshot(), ctx());
    const target = `${location.pathname}${q}${location.hash}`;
    if (`${location.pathname}${location.search}${location.hash}` === target) return;
    if (push) history.pushState(null, '', target);
    else history.replaceState(null, '', target);
  }
  $effect(() => {
    const now = snapshot();
    if (!ready) return;
    if (session.applyingFromUrl) {
      lastState = now;
      return;
    }
    const changed = lastState ? diffKeys(lastState, now) : [];
    lastState = now;
    if (!changed.length) return;
    const continuous = changed.every((k) => CONTINUOUS_KEYS.has(k));
    if (continuous) {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => syncUrl(false), 300);
    } else {
      if (debounce) {
        clearTimeout(debounce);
        debounce = null;
      }
      syncUrl(true);
    }
  });
  function applyFromUrl() {
    const { state, errors } = decodeState(location.search, ctx());
    session.applyingFromUrl = true;
    applyState(state);
    urlPos = state.map;
    queueMicrotask(() => (session.applyingFromUrl = false));
    if (errors.length) toast(tr('map.urlError'));
  }

  // ---------- selection → detail ----------
  $effect(() => {
    const c = ui.c;
    if (!ready) return;
    void loadDetail(c);
  });
  // selected country must exist in cmp? spec: "c 不在 cmp 則加入" applies only when cmp non-empty
  // (we keep selection independent; compare is explicit via C/+).

  // ---------- keyboard ----------
  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const typing =
      t &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable);
    if (e.key === 'Escape') {
      if (session.dialog) return; // modal handles
      if (typing) {
        (t as HTMLElement).blur();
        return;
      }
      // presentation mode: close everything
      if (ui.t || ui.c || ui.p === 'open') {
        ui.t = false;
        ui.c = null;
        ui.p = 'closed';
        session.presentation = true;
        toast(tr('keys.escape'));
      } else {
        session.presentation = false;
        ui.p = 'open';
      }
      return;
    }
    if (typing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case '/':
        e.preventDefault();
        if (session.narrow) session.railMobileOpen = true;
        else if (ui.p !== 'open') ui.p = 'open';
        setTimeout(() => searchEl?.focus(), 30);
        break;
      case 't':
      case 'T':
        ui.t = !ui.t;
        break;
      case 'ArrowLeft':
        setYear(ui.y - 1);
        break;
      case 'ArrowRight':
        setYear(ui.y + 1);
        break;
      case ' ':
        e.preventDefault();
        timelineRef?.play();
        break;
      case 'c':
      case 'C':
        if (ui.c) toggleCompare(ui.c);
        break;
      case 'd':
      case 'D':
        session.dialog = 'download';
        break;
      case '?':
        session.dialog = 'keys';
        break;
    }
  }

  onMount(() => {
    session.locale = locale;
    data.yearMin = yearMin;
    data.yearMax = yearMax;
    webgl = hasWebGL2();
    session.webgl2 = webgl;
    const mq = matchMedia('(max-width: 900px)');
    session.narrow = mq.matches;
    const onMq = (e: MediaQueryListEvent) => (session.narrow = e.matches);
    mq.addEventListener('change', onMq);
    // decode URL early with static year bounds so the first paint is right
    applyFromUrl();
    (async () => {
      try {
        await loadCore();
        // re-apply now that known ISO/regions are available (drops unknown codes with a toast)
        applyFromUrl();
        if (webgl) await loadGeo();
        ready = true;
        lastState = snapshot();
        // the pure-HTML skeleton has done its job (paint before JS) — remove it so it never
        // competes with the live UI for selectors, focus order or screen readers
        document.getElementById('map-skeleton')?.remove();
        document.getElementById('map-canvas-skeleton')?.remove();
        session.presentation = false;
        onIdle(() => void loadHistory());
        onIdle(() => void loadLive(), 4000);
      } catch (e) {
        data.error = String(e);
        // remove the skeleton here too — otherwise it sits underneath the error dialog forever
        document.getElementById('map-skeleton')?.remove();
        document.getElementById('map-canvas-skeleton')?.remove();
        toast(tr('common.error'));
      }
    })();
    const pop = () => applyFromUrl();
    window.addEventListener('popstate', pop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onMq);
    };
  });

  $effect(() => {
    document.body.classList.toggle('presentation', session.presentation);
  });
  $effect(() => {
    // resize the map when panels toggle
    void ui.p;
    void ui.t;
    void ui.c;
    setTimeout(() => mapRef?.resize(), 50);
  });
  // year changes beyond loaded history → make sure it's loading
  $effect(() => {
    if (ready && !view.yearAvailable && !data.historyLoaded) void loadHistory();
  });
  /** §10.5: footnotes applying to (country, current year, current metric) — cached files only. */
  function countryFootnoteCount(iso3: string): number {
    const f = raw.client.peekCountry(iso3);
    if (!f) return 0;
    return f.footnotes.filter(
      (x) => (x.year === null || x.year === ui.y) && footnoteMatchesMetric(x.population_type, ui.m),
    ).length;
  }
  /** WPP world population for the current year — legend "1 in n" line (anti-numbing). */
  const worldPop = $derived.by(() => {
    void data.stockVersion;
    let sum = 0;
    for (const c of data.countriesFile?.countries ?? []) {
      const p = raw.stock.pop(c.iso3, ui.y);
      if (p) sum += p;
    }
    return sum > 0 ? sum : null;
  });
  /** metric-level caveats (metrics.json), locale-resolved (#audit-2). */
  const metricCaveats = $derived.by(() => {
    const def = data.metrics?.metrics?.[ui.m];
    return def ? metricCaveatsFor(def, locale) : [];
  });
  const detailOpen = $derived(!!ui.c);
</script>

{#if ready}
  <div class="overlays" class:presentation={session.presentation}>
    <TopBar
      {locale}
      onshare={() => (session.dialog = 'share')}
      oncite={() => (session.dialog = 'cite')}
      ondownload={() => (session.dialog = 'download')}
      onkeys={() => (session.dialog = 'keys')}
    />
    <FilterRail {locale} {view} bind:searchEl />
    <div class="center">
      {#if webgl}
        <div class="map-controls">
          <button
            class="btn icon"
            type="button"
            aria-label={tr('map.zoomIn')}
            onclick={() => mapRef?.zoomIn()}>+</button
          >
          <button
            class="btn icon"
            type="button"
            aria-label={tr('map.zoomOut')}
            onclick={() => mapRef?.zoomOut()}>−</button
          >
          <button
            class="btn icon"
            type="button"
            aria-label={tr('map.fitWorld')}
            onclick={() => mapRef?.resetView()}
            title={tr('map.fitWorld')}>⌂</button
          >
        </div>
        {#if !session.basemapOk}<div class="chip nobasemap">{tr('map.noBasemap')}</div>{/if}
        {#if data.idu}
          <button
            class="btn idu-toggle"
            class:is-active={ui.e}
            type="button"
            aria-pressed={ui.e}
            title={tr('map.idu.body')}
            onclick={() => (ui.e = !ui.e)}>◉ {tr('map.idu.title')}</button
          >
          {#if ui.e}
            <div class="idu-sub" title={tr('idu.definitionNote')}>
              <button
                class="btn idu-chip"
                class:is-active={evConflict}
                type="button"
                aria-pressed={evConflict}
                onclick={() => (evConflict = !evConflict)}>{tr('idu.conflict.toggle')}</button
              >
              <button
                class="btn idu-chip"
                class:is-active={evDisaster}
                type="button"
                aria-pressed={evDisaster}
                onclick={() => (evDisaster = !evDisaster)}>{tr('idu.disaster.toggle')}</button
              >
            </div>
          {/if}
        {/if}
        <NowcastCard {locale} />
      {/if}
      <Legend {locale} {view} {worldPop} {metricCaveats} />
    </div>
    {#if detailOpen}
      <DetailPanel
        {locale}
        {view}
        oncite={() => (session.dialog = 'cite')}
        ondownload={() => (session.dialog = 'download')}
      />
    {:else}
      <div class="gap" style="grid-area: panel"></div>
    {/if}
    <Timeline bind:this={timelineRef} {locale} total={view.total} />
  </div>
  {#if ui.t}
    {#await import('./DataTable.svelte') then { default: DataTable }}
      <DataTable {locale} {view} />
    {/await}
  {/if}
  {#if session.dialog}
    {#await import('./Dialogs.svelte') then { default: Dialogs }}
      <Dialogs {locale} {view} {permalink} />
    {/await}
  {/if}
{/if}

{#if webgl && data.geoLoaded && raw.geo && data.countriesFile}
  <MapCanvas
    bind:this={mapRef}
    {styleUrl}
    geo={raw.geo}
    {view}
    norm={ui.n}
    selected={ui.c}
    compare={ui.cmp}
    initialPos={ui.map}
    pos={urlPos}
    railOpen={ui.p === 'open'}
    panelOpen={detailOpen}
    {locale}
    countryIndex={raw.countryIndex}
    idu={data.idu}
    showIdu={ui.e}
    iduConflict={evConflict}
    iduDisaster={evDisaster}
    flows={mapFlowArcs}
    highlight={session.hover}
    onselect={(iso3) => selectCountry(iso3)}
    onhover={(iso3) => (session.hover = iso3)}
    onprefetch={(iso3) => prefetchCountry(iso3)}
    footnoteCount={countryFootnoteCount}
    onmove={(p) => (ui.map = p)}
    onbasemap={(ok) => (session.basemapOk = ok)}
    onready={() => (session.mapReady = true)}
  />
{:else if ready && !webgl}
  <NoWebGLFallback {locale} {view} ondownload={() => (session.dialog = 'download')} />
{/if}
<AttributionBar {locale} />
<Toasts />
<div class="visually-hidden" aria-live="polite" aria-atomic="true">{session.announce}</div>
{#if data.error}
  <div class="modal-backdrop">
    <div class="modal">
      <h2>{tr('error.loadTitle')}</h2>
      <p class="small">{tr('error.loadBody')}</p>
      <details class="small muted">
        <summary>{tr('error.technical')}</summary>
        <p>{data.error}</p>
      </details>
      <button class="btn primary" type="button" onclick={() => location.reload()}
        >{tr('common.retry')}</button
      >
    </div>
  </div>
{/if}

<style>
  .idu-toggle {
    position: absolute;
    left: var(--overlay-gap);
    top: 132px;
    font-size: var(--fs-xs);
    box-shadow: var(--shadow-1);
  }
  .idu-sub {
    position: absolute;
    left: var(--overlay-gap);
    top: 164px;
    display: flex;
    gap: 4px;
  }
  .idu-chip {
    font-size: var(--fs-xs);
    padding: 2px 8px;
    box-shadow: var(--shadow-1);
  }
  .idu-chip:not(.is-active) {
    opacity: 0.55;
  }
  .idu-toggle:not(.is-active) {
    background: var(--c-surface);
  }
  @media (max-width: 900px) {
    .idu-toggle {
      top: 184px;
    }
    .idu-sub {
      top: 216px;
    }
  }
  .nobasemap {
    position: absolute;
    left: 56px;
    top: var(--overlay-gap);
    background: var(--c-surface);
  }
</style>
