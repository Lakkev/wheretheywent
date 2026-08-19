<script lang="ts">
  /**
   * MapLibre GL canvas. Dynamically imports maplibre-gl (only after the WebGL2 gate passed).
   * Year/metric changes repaint via setFeatureState (no setData) — §8.2.
   */
  import { onMount, onDestroy } from 'svelte';
  import { feature as topoFeature } from 'topojson-client';
  import type { Topology, GeometryCollection } from 'topojson-specification';
  import type { FeatureCollection } from 'geojson';
  import {
    choroplethLayers,
    fallbackStyle,
    firstSymbolLayerId,
    fitPadding,
    SRC_COUNTRIES,
    LYR_FILL,
    LYR_NOFILL,
    iduLayer,
    SRC_IDU,
    LYR_IDU,
  } from '../../lib/map-style';
  import type { ViewResult } from '../../lib/view';
  import type { MapPos } from '../../lib/url';
  import type { CountryMeta, IduFile } from '../../lib/types';
  import { fmtValue } from '../../lib/format';
  import { displayName } from '../../lib/data';
  import { useT, type Locale } from '../../i18n/ui';
  import { prefersReducedMotion } from '../../lib/webgl';

  let {
    styleUrl,
    geo,
    view,
    norm,
    selected,
    compare,
    initialPos,
    pos,
    railOpen,
    panelOpen,
    locale,
    countryIndex,
    idu,
    showIdu = false,
    onselect,
    onhover,
    onmove,
    onbasemap,
    onready,
  }: {
    styleUrl: string;
    geo: Topology;
    view: ViewResult;
    norm: 'abs' | 'per1k';
    selected: string | null;
    compare: string[];
    initialPos: MapPos | null;
    /** externally requested position (from URL/popstate); null = no request */
    pos: MapPos | null;
    railOpen: boolean;
    panelOpen: boolean;
    locale: Locale;
    countryIndex: Map<string, CountryMeta>;
    idu: IduFile | null;
    showIdu?: boolean;
    onselect: (iso3: string | null) => void;
    onhover: (iso3: string | null) => void;
    onmove: (p: MapPos) => void;
    onbasemap: (ok: boolean) => void;
    onready: () => void;
  } = $props();

  const tr = $derived(useT(locale));

  let container: HTMLDivElement;
  let map: import('maplibre-gl').Map | null = null;
  let ML: typeof import('maplibre-gl') | null = null;
  let styleLoaded = false;
  let layersAdded = false;
  let basemapTimer: ReturnType<typeof setTimeout> | null = null;
  let usingFallback = false;
  let hoverId: string | null = null;
  let tooltip = $state<{ x: number; y: number; iso3: string } | null>(null);
  let iduPopup = $state<{
    x: number;
    y: number;
    text: string;
    figure: number;
    type: string;
    date: string;
    iso3: string;
  } | null>(null);
  let destroyed = false;
  let lastAppliedPos: string | null = null;
  let suppressMove = false;

  const BASEMAP_TIMEOUT_MS = 4000;

  function geojson(): FeatureCollection {
    const fc = topoFeature(
      geo,
      geo.objects['countries'] as GeometryCollection,
    ) as unknown as FeatureCollection;
    for (const f of fc.features) {
      const iso3 = String(f.id ?? (f.properties as { iso3?: string })?.iso3 ?? '');
      f.properties = {
        ...(f.properties ?? {}),
        iso3,
        ...(iso3.startsWith('_') ? { nofill: 1 } : {}),
      };
    }
    return fc;
  }

  function addOurLayers() {
    if (!map || layersAdded) return;
    const style = map.getStyle();
    const before = usingFallback
      ? undefined
      : firstSymbolLayerId(style as { layers?: { id: string; type: string }[] });
    if (!map.getSource(SRC_COUNTRIES)) {
      map.addSource(SRC_COUNTRIES, { type: 'geojson', data: geojson(), promoteId: 'iso3' });
    }
    for (const { layer, before: b } of choroplethLayers(before)) {
      if (!map.getLayer(layer['id'] as string)) map.addLayer(layer as never, b ?? before);
    }
    layersAdded = true;
    paintAll();
    paintSelection();
    applyIdu();
  }

  function paintAll() {
    if (!map || !layersAdded) return;
    for (const r of view.rows) {
      if (!r.drawable) continue;
      map.setFeatureState(
        { source: SRC_COUNTRIES, id: r.iso3 },
        { color: r.color, dim: !r.visible },
      );
    }
  }

  let prevSelected: string | null = null;
  let prevCompare: string[] = [];
  function paintSelection() {
    if (!map || !layersAdded) return;
    if (prevSelected && prevSelected !== selected)
      map.setFeatureState({ source: SRC_COUNTRIES, id: prevSelected }, { selected: false });
    if (selected) map.setFeatureState({ source: SRC_COUNTRIES, id: selected }, { selected: true });
    for (const c of prevCompare)
      if (!compare.includes(c))
        map.setFeatureState({ source: SRC_COUNTRIES, id: c }, { compare: false });
    for (const c of compare)
      map.setFeatureState({ source: SRC_COUNTRIES, id: c }, { compare: true });
    prevSelected = selected;
    prevCompare = [...compare];
  }

  function applyIdu() {
    if (!map || !layersAdded) return;
    if (!showIdu || !idu) {
      if (map.getLayer(LYR_IDU)) map.removeLayer(LYR_IDU);
      return;
    }
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: idu.events
        .filter((e) => e.lat !== null && e.lon !== null)
        .map((e) => ({
          type: 'Feature',
          id: e.id,
          properties: {
            figure: e.figure ?? 0,
            iso3: e.iso3,
            text: e.text,
            type: e.type,
            date: e.displacement_date,
          },
          geometry: { type: 'Point', coordinates: [e.lon!, e.lat!] },
        })),
    };
    const src = map.getSource(SRC_IDU) as import('maplibre-gl').GeoJSONSource | undefined;
    if (src) src.setData(fc);
    else map.addSource(SRC_IDU, { type: 'geojson', data: fc });
    if (!map.getLayer(LYR_IDU)) map.addLayer(iduLayer() as never);
  }

  function fitTo(iso3: string) {
    if (!map) return;
    const meta = countryIndex.get(iso3);
    if (!meta?.bbox) return;
    const [w, s, e, n] = meta.bbox;
    const narrow = window.innerWidth < 900;
    const pad = fitPadding(railOpen, panelOpen, narrow);
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: pad, maxZoom: 6, duration: prefersReducedMotion() ? 0 : 600 },
    );
  }

  function currentPos(): MapPos {
    const c = map!.getCenter();
    return {
      z: Math.round(map!.getZoom() * 100) / 100,
      lat: Math.round(c.lat * 100) / 100,
      lon: Math.round(c.lng * 100) / 100,
    };
  }

  onMount(async () => {
    const mod = await import('maplibre-gl');
    await import('maplibre-gl/dist/maplibre-gl.css');
    if (destroyed) return;
    ML = mod;
    // MapLibre v6 locates its worker relative to the (bundled, hashed) main module → point it at the
    // vendored copy served from public/ (see scripts/dev/vendor-maplibre.mjs).
    mod.setWorkerUrl(`/vendor/maplibre-gl/${mod.getVersion()}/maplibre-gl-worker.mjs`);
    const start = initialPos ?? { z: 1.4, lat: 20, lon: 10 };
    map = new mod.Map({
      container,
      style: styleUrl,
      center: [start.lon, start.lat],
      zoom: start.z,
      minZoom: 0.8,
      maxZoom: 9,
      attributionControl: false,
      renderWorldCopies: true,
      fadeDuration: 0,
    });
    lastAppliedPos = `${start.z}/${start.lat}/${start.lon}`;
    // test hook (e2e reads center/zoom and rendered features); harmless in production
    (window as unknown as { __wtwMap?: unknown }).__wtwMap = map;
    map.touchZoomRotate.disableRotation();
    map.dragRotate.disable();
    map.keyboard.enable();

    basemapTimer = setTimeout(() => {
      if (!styleLoaded && map) {
        usingFallback = true;
        onbasemap(false);
        map.setStyle(fallbackStyle() as never);
      }
    }, BASEMAP_TIMEOUT_MS);

    map.on('style.load', () => {
      styleLoaded = true;
      if (basemapTimer) clearTimeout(basemapTimer);
      layersAdded = false; // style swap drops our layers
      addOurLayers();
      if (!usingFallback) onbasemap(true);
      onready();
    });
    map.on('error', (e: { error?: { message?: string; status?: number }; sourceId?: string }) => {
      // a failing style request → fall back immediately instead of waiting for the timer
      const msg = e?.error?.message ?? '';
      if (!styleLoaded && !usingFallback && (/style/i.test(msg) || e?.error?.status)) {
        usingFallback = true;
        if (basemapTimer) clearTimeout(basemapTimer);
        onbasemap(false);
        map?.setStyle(fallbackStyle() as never);
      }
    });
    map.on('mousemove', LYR_FILL, (e) => {
      const f = e.features?.[0];
      const iso3 = f ? String((f.properties as { iso3?: string }).iso3 ?? f.id) : null;
      if (iso3 !== hoverId) {
        if (hoverId) map!.setFeatureState({ source: SRC_COUNTRIES, id: hoverId }, { hover: false });
        if (iso3) map!.setFeatureState({ source: SRC_COUNTRIES, id: iso3 }, { hover: true });
        hoverId = iso3;
        onhover(iso3);
      }
      if (iso3) tooltip = { x: e.point.x, y: e.point.y, iso3 };
      map!.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', LYR_FILL, () => {
      if (hoverId) map!.setFeatureState({ source: SRC_COUNTRIES, id: hoverId }, { hover: false });
      hoverId = null;
      tooltip = null;
      onhover(null);
      map!.getCanvas().style.cursor = '';
    });
    map.on('mousemove', LYR_NOFILL, (e) => {
      const f = e.features?.[0];
      const iso3 = f ? String((f.properties as { iso3?: string }).iso3) : null;
      if (iso3) tooltip = { x: e.point.x, y: e.point.y, iso3 };
    });
    map.on('mouseleave', LYR_NOFILL, () => (tooltip = null));
    map.on('click', LYR_FILL, (e) => {
      const f = e.features?.[0];
      const iso3 = f ? String((f.properties as { iso3?: string }).iso3 ?? f.id) : null;
      onselect(iso3 === selected ? null : iso3);
    });
    map.on('click', (e) => {
      // click on empty map (no country) deselects
      const feats = map!.queryRenderedFeatures(e.point, { layers: layersAdded ? [LYR_FILL] : [] });
      if (!feats.length) onselect(null);
    });
    map.on('click', LYR_IDU, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as {
        text?: string;
        figure?: number;
        type?: string;
        date?: string;
        iso3?: string;
      };
      iduPopup = {
        x: e.point.x,
        y: e.point.y,
        text: String(p.text ?? ''),
        figure: Number(p.figure ?? 0),
        type: String(p.type ?? ''),
        date: String(p.date ?? ''),
        iso3: String(p.iso3 ?? ''),
      };
    });
    map.on('mouseenter', LYR_IDU, () => (map!.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', LYR_IDU, () => (map!.getCanvas().style.cursor = ''));
    map.on('moveend', () => {
      if (suppressMove) return;
      const p = currentPos();
      const key = `${p.z}/${p.lat}/${p.lon}`;
      if (key === lastAppliedPos) return; // initial load / programmatic jump — not a user move
      lastAppliedPos = key;
      onmove(p);
    });
  });

  onDestroy(() => {
    destroyed = true;
    if (basemapTimer) clearTimeout(basemapTimer);
    map?.remove();
    map = null;
  });

  // repaint when the view changes
  $effect(() => {
    void view;
    paintAll();
  });
  $effect(() => {
    void selected;
    void compare;
    paintSelection();
  });
  $effect(() => {
    void idu;
    void showIdu;
    if (!showIdu) iduPopup = null;
    applyIdu();
  });
  // fit to selected country when selection changes (not on first paint if pos came from URL)
  let firstFit = true;
  $effect(() => {
    const s = selected;
    if (!map || !s) {
      firstFit = false;
      return;
    }
    if (firstFit && initialPos) {
      firstFit = false;
      return;
    }
    firstFit = false;
    fitTo(s);
  });
  // external position request (popstate / URL)
  $effect(() => {
    const p = pos;
    if (!map || !p) return;
    const key = `${p.z}/${p.lat}/${p.lon}`;
    if (key === lastAppliedPos) return;
    lastAppliedPos = key;
    suppressMove = true;
    map.jumpTo({ center: [p.lon, p.lat], zoom: p.z });
    setTimeout(() => (suppressMove = false), 50);
  });

  export function zoomIn() {
    map?.zoomIn();
  }
  export function zoomOut() {
    map?.zoomOut();
  }
  export function resetView() {
    map?.flyTo({ center: [10, 20], zoom: 1.4, duration: prefersReducedMotion() ? 0 : 500 });
  }
  export function resize() {
    map?.resize();
  }

  const tipRow = $derived(tooltip ? view.byIso.get(tooltip.iso3) : undefined);
  const tipMeta = $derived(tooltip ? countryIndex.get(tooltip.iso3) : undefined);
</script>

<div
  class="map-canvas"
  bind:this={container}
  role="region"
  aria-label={tr('a11y.mapDescription')}
></div>
{#if iduPopup}
  <div
    class="map-tooltip idu-popup"
    style="left:{iduPopup.x + 12}px; top:{iduPopup.y + 12}px"
    role="dialog"
    aria-label={tr('map.idu.title')}
  >
    <div class="row">
      <strong>{displayName(countryIndex.get(iduPopup.iso3), locale, iduPopup.iso3)}</strong> ·
      <span class="chip estimate">{tr('source.estimate')}</span><button
        class="x"
        type="button"
        aria-label={tr('common.close')}
        onclick={() => (iduPopup = null)}>×</button
      >
    </div>
    <div class="val">
      {fmtValue(iduPopup.figure, 'abs', locale)} · {iduPopup.type} · {iduPopup.date}
    </div>
    <div class="muted note">{iduPopup.text}</div>
    <div class="muted note">IDMC IDU — {tr('map.idu.body')}</div>
  </div>
{/if}
{#if tooltip}
  <div class="map-tooltip" style="left:{tooltip.x + 12}px; top:{tooltip.y + 12}px" role="tooltip">
    {#if tooltip.iso3.startsWith('_')}
      <strong>{tooltip.iso3 === '_NCY' ? 'Northern Cyprus' : 'Somaliland'}</strong>
      <div class="muted">{tr('map.tooltip.noFill')}</div>
    {:else}
      <strong>{displayName(tipMeta, locale, tooltip.iso3)}</strong>
      {#if tipRow && tipRow.value !== null}
        <div class="val">
          {fmtValue(tipRow.value, norm, locale)}{norm === 'per1k'
            ? ' ' + tr('legend.per1k.unit')
            : ''}
        </div>
        {#if norm === 'per1k'}<div class="muted">{fmtValue(tipRow.abs, 'abs', locale)}</div>{/if}
        {#if tipRow.rank}<div class="muted">#{tipRow.rank}</div>{/if}
      {:else if tipMeta && !tipMeta.in_unhcr}
        <div class="muted">{tr('map.tooltip.notCovered')}</div>
      {:else}
        <div class="muted">{tr('map.tooltip.nodata')}</div>
      {/if}
      {#if tipMeta?.note}<div class="muted note">
          {locale === 'zh-Hant' && tipMeta.note_zh ? tipMeta.note_zh : tipMeta.note}
        </div>{/if}
    {/if}
  </div>
{/if}

<style>
  .map-tooltip {
    position: absolute;
    z-index: 15;
    pointer-events: none;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-2);
    padding: 6px 10px;
    font-size: var(--fs-sm);
    max-width: 260px;
    line-height: 1.35;
  }
  .map-tooltip .val {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .idu-popup {
    pointer-events: auto;
    max-width: 320px;
  }
  .idu-popup .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .idu-popup .x {
    margin-left: auto;
    border: 0;
    background: none;
    cursor: pointer;
    font-size: var(--fs-md);
  }
  .map-tooltip .note {
    font-size: var(--fs-xs);
    margin-top: 4px;
    border-top: 1px solid var(--c-border);
    padding-top: 4px;
  }
</style>
