/**
 * MapLibre style helpers (framework-free, typed loosely to avoid importing maplibre-gl here —
 * the heavy module is dynamically imported only after the WebGL2 gate).
 */
import { NODATA_COLOR } from './colors';

export const SRC_COUNTRIES = 'wtw-countries';
export const LYR_FILL = 'wtw-fill';
export const LYR_NOFILL = 'wtw-nofill';
export const LYR_LINE = 'wtw-line';
export const LYR_HOVER = 'wtw-hover';
export const LYR_SELECTED = 'wtw-selected';
export const LYR_COMPARE = 'wtw-compare';
export const LYR_IDU = 'wtw-idu';
export const SRC_IDU = 'wtw-idu-src';

/** Minimal offline style: flat water background, no tiles (basemap fallback, §8.2). */
export function fallbackStyle(): Record<string, unknown> {
  return {
    version: 8,
    name: 'wtw-fallback',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dfe9f3' } }],
  };
}

/**
 * Our layers. `beforeId` lets us slot under basemap labels when present.
 * fill-color comes from feature-state "color" set per country per year (setFeatureState, §8.2).
 */
export function choroplethLayers(
  beforeId?: string,
): { layer: Record<string, unknown>; before?: string }[] {
  const fillable = ['!', ['has', 'nofill']];
  return [
    {
      layer: {
        id: LYR_FILL,
        type: 'fill',
        source: SRC_COUNTRIES,
        filter: fillable,
        paint: {
          'fill-color': ['coalesce', ['feature-state', 'color'], NODATA_COLOR],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.35, 0.85],
        },
      },
      before: beforeId,
    },
    {
      // §11.3: Northern Cyprus / Somaliland are drawn as a dashed boundary and NEVER filled —
      // this must stay a line layer (a fill here would contradict /about/boundaries).
      layer: {
        id: LYR_NOFILL,
        type: 'line',
        source: SRC_COUNTRIES,
        filter: ['has', 'nofill'],
        paint: { 'line-color': '#8a97a6', 'line-width': 1, 'line-dasharray': [2, 2] },
      },
      before: beforeId,
    },
    {
      layer: {
        id: LYR_LINE,
        type: 'line',
        source: SRC_COUNTRIES,
        paint: {
          'line-color': '#7d8a99',
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 5, 1],
        },
      },
      before: beforeId,
    },
    {
      layer: {
        id: LYR_HOVER,
        type: 'line',
        source: SRC_COUNTRIES,
        paint: {
          'line-color': '#1f5fa8',
          'line-width': 2,
          'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
        },
      },
      before: beforeId,
    },
    {
      layer: {
        id: LYR_COMPARE,
        type: 'line',
        source: SRC_COUNTRIES,
        paint: {
          'line-color': '#1f5fa8',
          'line-width': 2.5,
          'line-dasharray': [2, 1.5],
          'line-opacity': ['case', ['boolean', ['feature-state', 'compare'], false], 1, 0],
        },
      },
      before: beforeId,
    },
    {
      layer: {
        id: LYR_SELECTED,
        type: 'line',
        source: SRC_COUNTRIES,
        paint: {
          'line-color': '#0b3a6e',
          'line-width': 3,
          'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0],
        },
      },
      before: beforeId,
    },
  ];
}

export function iduLayer(): Record<string, unknown> {
  return {
    id: LYR_IDU,
    type: 'circle',
    source: SRC_IDU,
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['sqrt', ['coalesce', ['get', 'figure'], 0]],
        // stops are in sqrt-space: 100→10, 1k→31.6, 10k→100, 100k→316 persons
        0,
        3,
        10,
        6,
        32,
        10,
        100,
        16,
        316,
        24,
      ],
      'circle-color': '#0b3a6e',
      'circle-opacity': 0.55,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
      'circle-sort-key': ['coalesce', ['get', 'figure'], 0],
    },
  };
}

/** Find the first symbol (label) layer id in a style, to insert our layers beneath labels. */
export function firstSymbolLayerId(
  style: { layers?: { id: string; type: string }[] } | undefined,
): string | undefined {
  return style?.layers?.find((l) => l.type === 'symbol')?.id;
}

/** fitBounds padding so the selection is centred in the visible (not panel-covered) area (§8.3). */
export function fitPadding(railOpen: boolean, panelOpen: boolean, narrow: boolean) {
  if (narrow) return { top: 64, left: 16, right: 16, bottom: 200 };
  return {
    top: 72,
    left: (railOpen ? 320 : 44) + 24,
    right: (panelOpen ? 380 : 0) + 24,
    bottom: 120,
  };
}
