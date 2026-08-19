/**
 * URL state codec (spec §9). Pure functions — no window access.
 *   encodeState(state, ctx) → "?y=2016&m=idps&c=SYR"   (defaults omitted, stable key order)
 *   decodeState(search, ctx) → { state, errors }      (bad params fall back to defaults, never throw)
 * Same state ⇒ byte-identical URL (used as cache key and in e2e).
 */
import { z } from 'zod';
import { METRIC_IDS, type AnyMetricId, type ViewId } from './types';
import type { ScaleKind } from './colors';

export const URL_METRICS: AnyMetricId[] = [...METRIC_IDS, 'total_poc'];
export const TABS = ['overview', 'series', 'demographics', 'flows', 'sources'] as const;
export type Tab = (typeof TABS)[number];
export type Norm = 'abs' | 'per1k';
export type RailState = 'open' | 'closed';

export interface MapPos {
  z: number;
  lat: number;
  lon: number;
}

export interface MapState {
  y: number;
  m: AnyMetricId;
  v: ViewId;
  n: Norm;
  sc: ScaleKind;
  c: string | null;
  cmp: string[];
  r: string[];
  min: number;
  map: MapPos | null;
  p: RailState;
  t: boolean;
  tab: Tab;
  f: boolean;
}

export interface CodecContext {
  yearMin: number;
  yearMax: number;
  /** Known ISO3 keys; if provided, unknown codes are dropped with an error. */
  knownIso?: Set<string>;
  /** Known region slugs; if provided, unknown slugs are dropped. */
  knownRegions?: Set<string>;
}

export const MAX_COMPARE = 3;

export function defaultState(ctx: CodecContext): MapState {
  return {
    y: ctx.yearMax,
    m: 'refugees',
    v: 'asylum',
    n: 'abs',
    sc: 'quant',
    c: null,
    cmp: [],
    r: [],
    min: 0,
    map: null,
    p: 'open',
    t: false,
    tab: 'overview',
    f: false,
  };
}

/** Key order is fixed so the same state always serialises identically. */
const KEY_ORDER = [
  'y',
  'm',
  'v',
  'n',
  'sc',
  'c',
  'cmp',
  'r',
  'min',
  'map',
  'p',
  't',
  'tab',
  'f',
] as const;

const ISO_RE = /^[A-Z0-9_]{3,4}$/;

function normIso(s: string): string {
  return s.trim().toUpperCase();
}

/** Apply the normalisation rules of §9.6: cmp deduped+sorted+≤3, c ∈ cmp is not enforced (c is selection), uppercase. */
export function normalizeState(s: MapState, ctx: CodecContext): MapState {
  const known = ctx.knownIso;
  const isKnown = (k: string) => ISO_RE.test(k) && (!known || known.has(k));
  const c = s.c ? normIso(s.c) : null;
  const cmp = [...new Set(s.cmp.map(normIso))].filter(isKnown).sort().slice(0, MAX_COMPARE);
  const r = [...new Set(s.r.map((x) => x.trim().toLowerCase()))]
    .filter((x) => x && (!ctx.knownRegions || ctx.knownRegions.has(x)))
    .sort();
  const y = Math.min(Math.max(Math.round(s.y), ctx.yearMin), ctx.yearMax);
  return {
    ...s,
    y,
    c: c && isKnown(c) ? c : null,
    cmp,
    r,
    min: Math.max(0, Math.round(s.min)),
    map: s.map ? { z: round2(s.map.z), lat: round2(s.map.lat), lon: round2(s.map.lon) } : null,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function encodeState(state: MapState, ctx: CodecContext): string {
  const d = defaultState(ctx);
  const s = normalizeState(state, ctx);
  const p = new URLSearchParams();
  for (const k of KEY_ORDER) {
    switch (k) {
      case 'y':
        if (s.y !== d.y) p.set('y', String(s.y));
        break;
      case 'm':
        if (s.m !== d.m) p.set('m', s.m);
        break;
      case 'v':
        if (s.v !== d.v) p.set('v', s.v);
        break;
      case 'n':
        if (s.n !== d.n) p.set('n', s.n);
        break;
      case 'sc':
        if (s.sc !== d.sc) p.set('sc', s.sc);
        break;
      case 'c':
        if (s.c) p.set('c', s.c);
        break;
      case 'cmp':
        if (s.cmp.length) p.set('cmp', s.cmp.join(','));
        break;
      case 'r':
        if (s.r.length) p.set('r', s.r.join(','));
        break;
      case 'min':
        if (s.min !== d.min) p.set('min', String(s.min));
        break;
      case 'map':
        if (s.map) p.set('map', `${fmt2(s.map.z)}/${fmt2(s.map.lat)}/${fmt2(s.map.lon)}`);
        break;
      case 'p':
        if (s.p !== d.p) p.set('p', s.p);
        break;
      case 't':
        if (s.t) p.set('t', '1');
        break;
      case 'tab':
        if (s.tab !== d.tab) p.set('tab', s.tab);
        break;
      case 'f':
        if (s.f) p.set('f', '1');
        break;
    }
  }
  const q = p.toString().replace(/%2C/g, ',').replace(/%2F/g, '/');
  return q ? `?${q}` : '';
}

function fmt2(v: number): string {
  // strip trailing zeros: 2.50 → 2.5, 3.00 → 3
  return String(Math.round(v * 100) / 100);
}

const MapPosSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?\/-?\d+(\.\d+)?\/-?\d+(\.\d+)?$/)
  .transform((s) => {
    const [z, lat, lon] = s.split('/').map(Number) as [number, number, number];
    return { z, lat, lon };
  })
  .refine(
    (m) => m.z >= 0 && m.z <= 22 && m.lat >= -90 && m.lat <= 90 && m.lon >= -540 && m.lon <= 540,
    'map out of range',
  );

export interface DecodeResult {
  state: MapState;
  /** Parameter names that were invalid and reset to default. */
  errors: string[];
}

export function decodeState(search: string, ctx: CodecContext): DecodeResult {
  const d = defaultState(ctx);
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const errors: string[] = [];
  const get = <T>(key: string, schema: z.ZodType<T>, fallback: T): T => {
    if (!p.has(key)) return fallback;
    const r = schema.safeParse(p.get(key));
    if (r.success) return r.data;
    errors.push(key);
    return fallback;
  };
  const list = (key: string) => (p.has(key) ? (p.get(key) ?? '').split(',').filter(Boolean) : []);

  const y = get('y', z.coerce.number().int().min(ctx.yearMin).max(ctx.yearMax), d.y);
  const m = get('m', z.enum(URL_METRICS as [AnyMetricId, ...AnyMetricId[]]), d.m);
  const v = get('v', z.enum(['asylum', 'origin']), d.v) as ViewId;
  const n = get('n', z.enum(['abs', 'per1k']), d.n) as Norm;
  const sc = get('sc', z.enum(['lin', 'log', 'quant']), d.sc) as ScaleKind;
  const cRaw = get('c', z.string().regex(/^[A-Za-z0-9_]{3,4}$/), null as string | null);
  const min = get('min', z.coerce.number().int().min(0), d.min);
  const map = get('map', MapPosSchema, null as MapPos | null);
  const pr = get('p', z.enum(['open', 'closed']), d.p) as RailState;
  const t = get(
    't',
    z.enum(['1', '0']).transform((x) => x === '1'),
    d.t,
  );
  const tab = get('tab', z.enum(TABS), d.tab) as Tab;
  const f = get(
    'f',
    z.enum(['1', '0']).transform((x) => x === '1'),
    d.f,
  );

  const cmpRaw = list('cmp');
  const rRaw = list('r');
  const pre: MapState = {
    y,
    m,
    v,
    n,
    sc,
    c: cRaw,
    cmp: cmpRaw,
    r: rRaw,
    min,
    map,
    p: pr,
    t,
    tab,
    f,
  };
  const state = normalizeState(pre, ctx);
  // report dropped codes
  if (cRaw && !state.c) errors.push('c');
  if (cmpRaw.length && state.cmp.length < new Set(cmpRaw.map(normIso)).size && ctx.knownIso)
    errors.push('cmp');
  if (
    rRaw.length &&
    state.r.length < new Set(rRaw.map((x) => x.toLowerCase())).size &&
    ctx.knownRegions
  )
    errors.push('r');
  return { state, errors: [...new Set(errors)] };
}

/** Which keys changed between two states — used to decide pushState vs replaceState. */
export function diffKeys(a: MapState, b: MapState): (keyof MapState)[] {
  const out: (keyof MapState)[] = [];
  for (const k of KEY_ORDER) {
    const av = a[k],
      bv = b[k];
    const same = Array.isArray(av)
      ? JSON.stringify(av) === JSON.stringify(bv)
      : typeof av === 'object'
        ? JSON.stringify(av) === JSON.stringify(bv)
        : av === bv;
    if (!same) out.push(k);
  }
  return out;
}

/** Continuous parameters: changes to these use replaceState + debounce (§9 rule 3). */
export const CONTINUOUS_KEYS: ReadonlySet<keyof MapState> = new Set(['y', 'map', 'min']);
