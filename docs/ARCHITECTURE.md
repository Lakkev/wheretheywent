# ARCHITECTURE — every decision and _why_

This file exists so that a future maintainer (human or AI) can change things without re-deriving
the reasoning or re-breaking something that was fixed on purpose. The binding specification is
`SPEC.md` (frozen 2026-08-19). Where the implementation deviates from the spec, it is called out
below with the measured reason.

## 1. One-paragraph overview

A **static site** (Astro 7, `output: 'static'`) with **Svelte 5** islands. All data is produced at
build/ETL time by a **Node 22 TypeScript pipeline** (no build step, native type stripping) that
fetches UNHCR / IDMC / UN WPP, normalises to ISO3, validates 23 checks, and commits JSON/CSV files
into `public/data/v1/`. The browser never calls an upstream API. Hosting is Cloudflare Pages
(direct upload via wrangler from GitHub Actions, free). The ETL runs daily on GitHub Actions and commits **only when content
changes**, so most days produce no commit and no deploy.

```
GitHub Actions (03:17 UTC) ── run.ts → validate.ts → promote.ts ── git commit (if changed)
        ▲                                                                  │
        │ alerts via pinned issue                                          ▼
   docs/RUNBOOK.md                                       GitHub Actions: npm run build → wrangler pages deploy dist
                                                                          │
                                      browser: HTML skeleton → MapApp island → /data/v1/*.json
                                               MapLibre GL (WebGL2) + OpenFreeMap tiles (decor only)
```

## 2. Repository map

| Path                               | Role                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/etl/config.ts`            | **All magic numbers**: endpoints, throttling, thresholds, golden numbers, year windows                                                                                     |
| `scripts/etl/run.ts`               | Orchestrator: fetch every source independently, transform, write staging                                                                                                   |
| `scripts/etl/validate.ts`          | 16 spec invariants + schemas + golden numbers + size gates → `_validation.json`                                                                                            |
| `scripts/etl/promote.ts`           | Copy passing _groups_ into `public/data/v1`, mark failed sources stale, rebuild manifest                                                                                   |
| `scripts/etl/lib/codes.ts`         | ★ ISO3 normalisation; `sanitizeRow()` deletes UNHCR internal codes and installs throwing getters                                                                           |
| `scripts/etl/lib/registry.ts`      | countries.json: UNHCR list ⊕ geometry ⊕ WPP ⊕ display overrides                                                                                                            |
| `scripts/etl/lib/transform.ts`     | stock windows, country files, flows, CSV downloads, datapackage                                                                                                            |
| `scripts/etl/lib/provenance.ts`    | sources.json entries (license, attribution, caveats, the three dates)                                                                                                      |
| `scripts/etl/geo/build-geo.ts`     | world-atlas 50m → ISO3 ids → mapshaper simplify → TopoJSON + centroid/bbox index                                                                                           |
| `scripts/etl/sources/*.ts`         | One module per upstream                                                                                                                                                    |
| `src/lib/*.ts`                     | **Framework-free pure functions** (url codec, colours, citation, csv, columnar, format, view) — 100 % unit-tested, the "escape hatch" if the UI framework is ever replaced |
| `src/lib/state.svelte.ts`          | The single reactive store (Svelte 5 runes)                                                                                                                                 |
| `src/components/map/*`             | The map page islands (MapApp is the only root island, `client:only`)                                                                                                       |
| `src/components/country/*`         | Country page & compare page islands                                                                                                                                        |
| `src/components/pages/*.astro`     | Page bodies shared by `/` and `/zh-Hant/` routes                                                                                                                           |
| `src/i18n/`                        | `en.json` (source of truth) + 6 fully translated locales (zh-Hant, zh-Hans, fr, es, ja, ko; key parity enforced by tests), `ui.ts`                                                                                   |
| `public/data/v1/`                  | The published dataset (committed; audit trail = git history)                                                                                                               |
| `public/vendor/maplibre-gl/<ver>/` | MapLibre worker files copied by `scripts/dev/vendor-maplibre.mjs` (gitignored, generated on install/build)                                                                 |
| `tests/unit`, `tests/e2e`          | vitest / Playwright                                                                                                                                                        |
| `docs/`                            | this file, RUNBOOK, DATA-DICTIONARY, data-verification log                                                                                                                 |

## 3. Decisions and their reasons

### 3.1 Data keyed by `coo_iso` / `coa_iso`, never `coo` / `coa`

UNHCR's `coo`/`coa` are internal codes that collide with real ISO3 codes (`AUS`=Austria, `ARE`=Egypt,
`MAR`=Martinique). `sanitizeRow()` removes them and makes any access throw. Tests:
`tests/unit/codes.test.ts` (golden cases), validate #2 (countries.json names vs codes).
**Never "fix" a parsing problem by reading `coo`/`coa`.**

### 3.2 `null` ≠ `0`, end to end

UNHCR sends `"-"` (not reported) vs `"0"`. `toNum()` maps to `null` vs `0`. The columnar codec packs
runs of zeros as `["z",n]` and runs of nulls as `["n",n]` (the null-run extension is ours; the spec
only mentioned zero-runs — it cut the history file from 941 KB to much less raw without losing the
distinction; round-trip is fuzz-tested). Colours: grey vs lightest sand. CSV: empty vs `0`.

### 3.3 Static, no runtime API, data in git

Reasons (spec §4): zero hosting cost, no quota/CORS problems (HDX/IDMC presigned URLs, no CORS),
audit trail via `git log -- public/data/v1/country/SYR.json`, previews & rollback for free.
Consequence: **every generated file must be byte-stable when content has not changed**. That is why
`retrieved_at` only advances when a source's content hash changes, `snapshot` in data files is the
population source's `retrieved_at`, `unmatched-report.json` carries that same stamp, and
`sources.json` contains no "last run" timestamp. Verified: two consecutive runs → zero diff.

### 3.4 `snapshot_id` = content hash, not git hash (deviation)

The spec says git short hash. A commit hash is unknowable before the commit and writing it afterwards
would change the content (and hence the hash). We use the first 8 hex chars of sha256 over all file
hashes — deterministic, and `manifest.git_commit` records the CI commit when available. The footer
and citations show `snapshot_id`.

### 3.5 Promotion granularity = source group

`promote.ts` groups files: `countries`, `geo`, `core` (stock/country/flows/downloads/metrics),
`nowcast`, `idu`. A failing group keeps its previous files; its sources become `status:"stale"` with
`stale_since`; the TopBar shows the amber chip; after ≥3 days `promote.ts` exits 1 → the workflow
fails → issue comment → e-mail. Secondary sources (demographics, solutions…) that fail are
**carried over from the previous country files** so the new country files are still complete.
Tested with `ETL_FAIL=unhcr_demographics,idmc_idu,unhcr_population`.

### 3.6 Year upper bound is detected, never hard-coded

`sources/unhcr-years.ts`: `/years/` lists 2027 already; `/population/?year=Y` is probed downwards
until rows exist (2025 on 2026-08-19).

### 3.7 Geometry: Natural Earth 50m, 20 % simplification (deviation from 4 %)

Measured: the spec's 4 % left Lebanon with 5 vertices (72 KB). 20 % keeps small host countries
recognisable at 165 KB raw / 42 KB br — still under the 280 KB gate and the 80 KB br first-screen
estimate. `-clean` was dropped (it corrupted Fiji); rings spanning the antimeridian (Russia, Fiji)
are unwrapped by shifting the minority side ±360° before encoding so MapLibre does not draw
world-wide bands. Ids: M49 → alpha-3 via `i18n-iso-countries`; `geo/overrides.json` for id=-99
(Kosovo→XKX, N. Cyprus→`_NCY`, Somaliland→`_SOL` = draw but never fill; Siachen, Indian Ocean
Ter. dropped). Vatican collapses to null geometry at this quantization and is dropped (it is still
a countries.json entity, listed as unmappable if it has data).

### 3.8 MapLibre GL JS 6 and the worker (important)

v6 locates its web worker with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. Once the main
module is bundled to `/_astro/<hash>.js` that URL 404s and **all sources silently never load**
(`isSourceLoaded()` stays false; no error event). Fix: `scripts/dev/vendor-maplibre.mjs` copies
`maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` to `public/vendor/maplibre-gl/<version>/`
(predev/prebuild/postinstall) and `MapCanvas.svelte` calls `setWorkerUrl(...)` before creating
the map. Keep this when upgrading MapLibre. Also: `maplibre-gl.css` sets `.maplibregl-map
{position:relative}` which overrode our absolute map container → `.map-canvas` uses `!important`.

### 3.9 Year scrubbing = `setFeatureState`, not `setData`

All stock values for the loaded windows are in memory (`StockStore`, eagerly unpacked). Changing
year/metric/view recomputes `computeView()` (pure) and calls `setFeatureState` per country
(≈230 calls, a few ms). No network, no geometry re-parse. e2e asserts zero `/data/v1/` requests
while scrubbing.

### 3.10 URL state (`src/lib/url.ts`)

Stable key order, defaults omitted, zod `.catch`-style fallbacks with a toast, continuous params
(`y`, `map`, `min`) → `replaceState` + 300 ms debounce, discrete → `pushState`, `popstate`
re-applies with the `applyingFromUrl` flag. `e=1` (IDU event layer) was added beyond the spec;
`f=1` stays reserved for Phase 2 flow arcs. The map position is only written after a _user_ move
(the initial `moveend` is ignored) so the default URL stays clean.

### 3.11 Basemap is decoration

OpenFreeMap `positron` via `PUBLIC_MAP_STYLE_URL`. If the style does not load within 4 s (or
errors), the map switches to an inline water-only style and our layers are re-added; a chip says
"Basemap unavailable". e2e aborts all tile requests and asserts the choropleth still renders.

### 3.12 WebGL2 gate

`hasWebGL2()` runs before `import('maplibre-gl')`. Without WebGL2 the page renders
`NoWebGLFallback` (the DataTable, which is the accessible equivalent anyway) and the 200 KB
maplibre chunk is never requested (e2e asserts). The 8 KB maplibre CSS is page-level (Astro hoists
CSS of dynamic imports) — accepted.

### 3.13 Colours — deviation from D6

**Supersedes spec D6 (Blues-only), owner decision 2026-08-25.** The ramp is ColorBrewer
**YlOrBr** (sand → ochre → tilled-soil brown, "desert & soil"), 7 classes, CVD-safe.
D6's *principle* — never frame displaced people as a threat — is kept and enforced
differently: the site contains no red anywhere (the deepest class is soil brown, not an
alarm colour), flows are arcs rather than arrows, and `tests/unit/colors.test.ts` fails
the build unless the ramp is warm-earth (r ≥ b, g ≥ b) and monotonically darkening.
Quantile default (always contrast), log/linear with "nice" rounding; zero = lightest,
null = warm grey; both always in the legend.

### 3.14 i18n

Astro routing (`/` en, `/zh-Hant/`), JSON dictionaries, `zh-Hant.json` type-checked to have
exactly en's keys (missing/extra key = compile error) and unit-tested for placeholder parity.
Values are English for the MVP (D3). Country display names: override table
(`display-overrides.json`) with the UNHCR name always shown next to it; `display_name_zh` exists for
a few entities and falls back to English.

### 3.15 Citations & downloads

`src/lib/citation.ts` (APA/Chicago/BibTeX/"cite this page", en+zh) is pure and unit-tested against
the spec's template. CSV is strict RFC 4180 (no `#` lines) unless the user opts in (remembered in
`localStorage`). JSON downloads carry `meta` with permalink, sources and the four citations.

### 3.16 What was deliberately left out

ACLED (licence), IOM DTM (licence unclear), UNHCR ODP/microdata (non-commercial), person-level
anything, donations on-site, analytics/cookies.

### 3.17 Post-audit hardening (2026-08-24)

A line-by-line audit against the frozen spec (see `docs/GAP-ANALYSIS.md` for the complete
finding-by-finding record) led to:

- **`_NCY`/`_SOL` are outline-only** (dashed line layer). This is a _public-claim invariant_:
  `/about/boundaries` states they are never filled — do not change the layer type without
  changing the page and `disputed-notes.json` in the same commit.
- **One site URL.** `astro.config.mjs` loads `.env` via Vite `loadEnv`; `PUBLIC_SITE_URL` is
  the single source for canonical/sitemap/citations/JSON-LD.
- **Provenance on every surface**: AttributionBar (data_as_of/retrieved/licence), DataTable
  header, WebGL-less fallback (`SourceNote`). The map is a chart; it carries its source line.
- **D17 report links** are built at click time from `location.href` (map menu item; footer
  inline script) so the mailto always carries the exact share URL.
- **Snapshot semantics**: bulk CSVs and `datapackage.version` embed the first 8 hex of the
  population source content hash (`sources.json → content_hash`) — the manifest-wide id cannot
  be embedded in files it hashes. Client "this view" downloads embed `manifest.snapshot_id`.
- **`unstable` status is live** (§7.2): `UnstableSourceError` → `status:"unstable"`, distinct
  from `stale` in sources.json and the RUNBOOK triage table.
- **Unmatched-code tripwire covers every source** (§7.7): each fetcher returns
  `unmatched: UnmatchedEntry[]`; `guardUnmatched()` fails any source with a >10,000-person
  unmatched code; all entries merge into one `unmatched-report.json`.
- **Invariants strengthened**: #5 runs across all 9 metrics; #6 scans country files + flows;
  #7 asserts `pack(unpack(x))` is byte-identical for every published series.
- **Retries**: any 429/5xx (incl. Cloudflare 52x).
- **Citation dates** render `en-GB` ("31 December 2025") matching the spec template exactly.
- **Hover-intent prefetch** (500 ms) on the map + external `highlight` prop so rank-list/table
  hover outlines the country; tooltip shows the count of UNHCR footnotes for the current
  year+metric (mapping: `src/lib/data.ts → FOOTNOTE_TYPES`).
- **Perf e2e measures real LCP** (buffered PerformanceObserver, 4G throttle, < 2.5 s) and the
  real brotli weight of every JS chunk fetched (< 400 KB).

Accepted deviations from the spec are tabulated in GAP-ANALYSIS §4 — read that before "fixing"
any of them back.

### 3.18 Multi-expert review changes (2026-08-24)

- **i18n depth**: translations are data, not chrome — `definition_zh`/`caveats_zh` live in
  `metrics.json` and `sources.json` (produced by the ETL), so every consumer (map legend, data
  page, downloads, JSON-LD) localises from one source of truth. UI strings stay in
  `src/i18n/zh-Hant.json`, key-parity-typed against `en.json`; `docs/STYLE-zh.md` locks
  terminology (庇護國 not 收容國 — Taiwan legal register, etc.).
- **Fixed classing**: `computeView` accepts `breakYears`; `MapApp` passes all loaded years, so
  quantile breaks are stable while scrubbing — colour means magnitude, and screenshots from
  different years are comparable.
- **IDU dignity guards** (ETL + client): conflict coordinates snapped to 0.25°, events <100
  people never drawn individually, popup links out to IDMC instead of republishing narrative.
  Conflict/disaster sub-toggles (disasters off by default: the coloured annual IDP layer
  excludes disasters, so mixing them silently would misrepresent it).
- **Export provenance by default**: `#` comment lines (title, permalink, source, dates,
  snapshot, filters, metric caveats) ship unless the user opts into strict RFC 4180
  (`wtw.csvStrict`); snapshot columns renamed to say *which* snapshot
  (`population_snapshot_id` vs `dataset_snapshot_id`); `yoy_delta` in all view exports.
- **`world-totals.json`**: year → metric → global totals (both views, incl. derived
  `total_poc`), built from the stock totals at ETL time; powers "share of world total" on
  country pages without shipping the stock files to them.
- **Deploy traceability (S4)**: `npm run deploy` = dirty-tree guard → build → stamp
  `dist/build-info.json` (commit + time) → wrangler upload.
- **`live/*` is not committed (S9)**: nowcast and IDU files are preliminary, replaced daily and
  would grow the repository by hundreds of MB per year. The git audit trail covers the annual
  statistics; the live layer is regenerated by every ETL run (a fresh clone simply shows no live
  layer until `npm run etl` runs), and IDMC/UNHCR retain the underlying source data.
- **F8**: the dialog stack and the data table are dynamically imported — neither loads until the
  user opens them, keeping the first-paint bundle lean as features accumulate.

## 4. Budgets (measured 2026-08-19)

| Item                                       | Measured               | Budget                   |
| ------------------------------------------ | ---------------------- | ------------------------ |
| First-screen JS + CSS (br, excl. Plot)     | ≈ 269 KB               | ≤ 320 KB                 |
| `index.html` (br)                          | 3.1 KB                 | —                        |
| `stock/2015-2025.json`                     | 151 KB raw / 38 KB br  | 200 / 45                 |
| `geo/world-50m.topo.json`                  | 165 KB raw / 42 KB br  | < 280 KB raw             |
| `country/*.json`                           | 8–53 KB raw, 3–7 KB br | 3–12 KB br               |
| `downloads/unhcr-population-all-years.csv` | 18.8 MB                | < 20 MiB (validate gate) |
| Published files                            | 277                    | < 5,000                  |
| ETL wall time (cold)                       | ≈ 3 min                | —                        |

## 5. How to change common things

- **Add a metric**: `METRIC_IDS` in `src/lib/types.ts` (order matters — it is the array index in
  every data file) → `lib/metrics.ts` definition → i18n keys `metric.<id>` → re-run ETL.
- **Add/override a country name or note**: `scripts/etl/lib/display-overrides.json`.
- **Change how a disputed place is drawn/explained**: `geo/overrides.json` (geometry),
  `geo/disputed-notes.json` (text, en+zh), `display-overrides.json` (name/note).
- **Change throttling, thresholds, golden numbers**: `scripts/etl/config.ts` only.
- **Swap basemap**: `PUBLIC_MAP_STYLE_URL` env var (any MapLibre style URL).
- **Upgrade MapLibre**: bump version, run `npm i`, confirm `public/vendor/maplibre-gl/<ver>` exists and
  the map renders (e2e `fallbacks.spec.ts` covers it).
- **Phase 2 flows**: data already exists in `public/data/v1/flows/{year}.json` (origin, asylum,
  refugees, asylum_seekers); `f=1` is reserved in the URL codec.

## 6. Local development

```
npm ci                    # also vendors the MapLibre worker
ETL_CACHE=1 npm run etl   # cached raw responses in .etl-raw (dev only)
npm run etl:validate && npm run etl:promote
npm run dev               # http://localhost:4321
npm run check && npm test
npm run build && npm run test:e2e   # e2e serves dist/ via scripts/dev/serve-dist.mjs
```

`ETL_FAIL=unhcr_population,idmc_idu npm run etl` simulates source failures.
