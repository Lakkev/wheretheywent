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
    flowsLayer,
    SRC_FLOWS,
    LYR_FLOWS,
  } from '../../lib/map-style';
  import type { ViewResult } from '../../lib/view';
  import type { MapPos } from '../../lib/url';
  import type { CountryMeta, IduFile } from '../../lib/types';
  import { fmtValue } from '../../lib/format';
  import { displayName } from '../../lib/data';
  import { useT, type Locale, type MessageKey } from '../../i18n/ui';
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
    iduConflict = true,
    iduDisaster = true,
    flows = null,
    highlight = null,
    onselect,
    onhover,
    onprefetch,
    footnoteCount,
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
    /** F6: conflict/disaster sub-toggles — event types the annual stock does not cover */
    iduConflict?: boolean;
    iduDisaster?: boolean;
    /** Phase 2: precomputed flow arcs for the selected country (origin → asylum). */
    flows?: { from: [number, number]; to: [number, number]; value: number; width: number }[] | null;
    /** externally requested hover highlight (rank list / table rows) — same visual as map hover */
    highlight?: string | null;
    onselect: (iso3: string | null) => void;
    onhover: (iso3: string | null) => void;
    /** hover-intent prefetch of country/{ISO3}.json after 500 ms (§8.5) */
    onprefetch?: (iso3: string) => void;
    /** number of UNHCR footnotes applying to this country for the current year+metric (§10.5) */
    footnoteCount?: (iso3: string) => number;
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
  let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
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
  const HOVER_PREFETCH_MS = 500;

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
    applyFlows();
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
        // #audit F5(a): events under 100 people are not drawn as individual points
        .filter((e) => e.lat !== null && e.lon !== null && (e.figure ?? 0) >= 100)
        // F6: conflict/disaster sub-toggles (unknown types always shown while the layer is on)
        .filter((e) => {
          const t = (e.type ?? '').toLowerCase();
          return t === 'conflict' ? iduConflict : t === 'disaster' ? iduDisaster : true;
        })
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

  /** Quadratic-bezier arc between two centroids, lifted perpendicular to the chord. */
  function arcCoords(a: [number, number], b: [number, number]): [number, number][] {
    const [x1, y1] = a;
    const [x2, y2] = b;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const d = Math.hypot(dx, dy) || 1;
    const lift = Math.min(12, d * 0.18);
    const cx = (x1 + x2) / 2 - (dy / d) * lift;
    const cy = (y1 + y2) / 2 + (dx / d) * lift;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const u = 1 - t;
      pts.push([
        u * u * x1 + 2 * u * t * cx + t * t * x2,
        u * u * y1 + 2 * u * t * cy + t * t * y2,
      ]);
    }
    return pts;
  }

  function applyFlows() {
    if (!map || !layersAdded) return;
    if (!flows || !flows.length) {
      if (map.getLayer(LYR_FLOWS)) map.removeLayer(LYR_FLOWS);
      return;
    }
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: flows.map((f, i) => ({
        type: 'Feature',
        id: i,
        properties: { width: f.width, value: f.value },
        geometry: { type: 'LineString', coordinates: arcCoords(f.from, f.to) },
      })),
    };
    const src = map.getSource(SRC_FLOWS) as import('maplibre-gl').GeoJSONSource | undefined;
    if (src) src.setData(fc);
    else map.addSource(SRC_FLOWS, { type: 'geojson', data: fc });
    if (!map.getLayer(LYR_FLOWS)) map.addLayer(flowsLayer() as never);
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
        // §8.5: prefetch the country file only after 500 ms of hover intent
        if (prefetchTimer) clearTimeout(prefetchTimer);
        if (iso3 && onprefetch)
          prefetchTimer = setTimeout(() => onprefetch(iso3), HOVER_PREFETCH_MS);
      }
      if (iso3) tooltip = { x: e.point.x, y: e.point.y, iso3 };
      map!.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', LYR_FILL, () => {
      if (hoverId) map!.setFeatureState({ source: SRC_COUNTRIES, id: hoverId }, { hover: false });
      hoverId = null;
      if (prefetchTimer) clearTimeout(prefetchTimer);
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
    if (prefetchTimer) clearTimeout(prefetchTimer);
    map?.remove();
    map = null;
    delete (window as unknown as { __wtwMap?: unknown }).__wtwMap;
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
    void iduConflict;
    void iduDisaster;
    if (!showIdu) iduPopup = null;
    applyIdu();
  });
  $effect(() => {
    void flows;
    applyFlows();
  });
  // external hover (rank list / data table rows) drives the same hover outline on the map
  let prevExtHover: string | null = null;
  $effect(() => {
    const h = highlight;
    if (!map || !layersAdded) return;
    if (prevExtHover && prevExtHover !== h && prevExtHover !== hoverId)
      map.setFeatureState({ source: SRC_COUNTRIES, id: prevExtHover }, { hover: false });
    if (h) map.setFeatureState({ source: SRC_COUNTRIES, id: h }, { hover: true });
    prevExtHover = h;
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
    if (!map) return;
    if (!p) {
      // back/forward to a URL without map= → default world camera (#audit F2)
      const key = '1.4/20/10';
      if (lastAppliedPos !== key) {
        lastAppliedPos = key;
        suppressMove = true;
        map.jumpTo({ center: [10, 20], zoom: 1.4 });
        setTimeout(() => (suppressMove = false), 50);
      }
      return;
    }
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
  const iduTypeLabel = (t: string) => {
    const label = tr(('idu.type.' + t.toLowerCase()) as MessageKey);
    return label.startsWith('idu.type.') ? t : label;
  };
  const tipFootnotes = $derived(tooltip && footnoteCount ? footnoteCount(tooltip.iso3) : 0);
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
      {fmtValue(iduPopup.figure, 'abs', locale)} · {iduTypeLabel(iduPopup.type)} · {iduPopup.date}
    </div>
    {#if iduPopup.url}
      <div class="note">
        <a href={iduPopup.url} target="_blank" rel="noopener">{tr('idu.readReport')}</a>
      </div>
    {/if}
    <div class="muted note">IDMC IDU — {tr('map.idu.body')}</div>
  </div>
{/if}
{#if tooltip}
  <div class="map-tooltip" style="left:{tooltip.x + 12}px; top:{tooltip.y + 12}px" role="tooltip">
    {#if tooltip.iso3.startsWith('_')}
      <strong>{tooltip.iso3 === '_NCY' ? tr('geo.northernCyprus') : tr('geo.somaliland')}</strong>
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
      {#if tipFootnotes > 0}<div class="muted">
          ※ {tipFootnotes} · {tr('country.footnotes')}
        </div>{/if}
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
