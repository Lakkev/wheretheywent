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
  import { onIdle } from '../../lib/data';
  import TopBar from './TopBar.svelte';
  import FilterRail from './FilterRail.svelte';
  import Legend from './Legend.svelte';
  import Timeline from './Timeline.svelte';
  import DetailPanel from './DetailPanel.svelte';
  import DataTable from './DataTable.svelte';
  import MapCanvas from './MapCanvas.svelte';
  import NoWebGLFallback from './NoWebGLFallback.svelte';
  import AttributionBar from './AttributionBar.svelte';
  import NowcastCard from './NowcastCard.svelte';
  import Dialogs from './Dialogs.svelte';
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
      },
      raw.stock,
      countries,
    );
  });
  const permalink = $derived(
    typeof location !== 'undefined'
      ? `${location.origin}${location.pathname}${encodeState(snapshot(), ctx())}`
      : '',
  );

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
    mq.addEventListener('change', (e) => (session.narrow = e.matches));
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
        document.getElementById('map-skeleton')?.setAttribute('hidden', '');
        document.getElementById('map-canvas-skeleton')?.setAttribute('hidden', '');
        session.presentation = false;
        onIdle(() => void loadHistory());
        onIdle(() => void loadLive(), 4000);
      } catch (e) {
        data.error = String(e);
        toast(tr('common.error'));
      }
    })();
    const pop = () => applyFromUrl();
    window.addEventListener('popstate', pop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('keydown', onKey);
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
        {/if}
        <NowcastCard {locale} />
      {/if}
      <Legend {locale} {view} />
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
    <DataTable {locale} {view} />
  {/if}
  <Dialogs {locale} {view} {permalink} />
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
    onselect={(iso3) => selectCountry(iso3)}
    onhover={(iso3) => (session.hover = iso3)}
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
      <h2>{tr('common.error')}</h2>
      <p class="small muted">{data.error}</p>
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
  .idu-toggle:not(.is-active) {
    background: var(--c-surface);
  }
  @media (max-width: 900px) {
    .idu-toggle {
      top: 184px;
    }
  }
  .nobasemap {
    position: absolute;
    left: 56px;
    top: var(--overlay-gap);
    background: var(--c-surface);
  }
</style>
