# GAP ANALYSIS — spec audit of 2026-08-24 and its resolution

On 2026-08-24 the implementation was audited line-by-line against the frozen `SPEC.md` by three
independent review passes (frontend §8–9; ETL/citation/testing §7, §10, §13; decisions/boundaries
/phases §1–2, §11–14, appendices). Every finding was verified against the actual code and the
shipped `dist/` before being accepted. This file is the plan of record: what was wrong, what was
fixed, what is deliberately different from the spec, and what is deferred.

The ordering principle is the spec's own priority ladder (§1.3):
**citation correctness > methodology completeness > data quality > permalink stability > visuals.**

## 1. Credibility defects — fixed 2026-08-24

These were cases where the site _said something that was not true_. All fixed before any outreach.

| #    | Finding                                                                                                                                                                                                                                                                                                                        | Fix                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 | `/about/boundaries` and `disputed-notes.json` stated Northern Cyprus / Somaliland are "drawn but **never filled**", yet `LYR_NOFILL` was a `fill` layer painting them grey                                                                                                                                                     | The layer is now a dashed **line** (outline only) — `src/lib/map-style.ts`. A code comment marks it as a public-claim invariant                                                                                                                                                                                                                                                                                                 |
| P0-2 | Site-URL split brain: `astro.config.mjs` read `process.env` (never loaded from `.env`) while `src/lib/site.ts` read `import.meta.env` → one build mixed `pages.dev` and `lakkev.com` in canonical/JSON-LD/mailto                                                                                                               | `astro.config.mjs` now loads `.env` via Vite's `loadEnv`; one source of truth (`PUBLIC_SITE_URL`)                                                                                                                                                                                                                                                                                                                               |
| P0-3 | §10 "SourceNote under every chart" — the choropleth itself, the DataTable and the WebGL-less fallback had **no** provenance; and `/about` claimed "every page has a report link that pre-fills the current view" while the map page had **zero** `mailto:` and doc pages pre-filled a build-time URL without query state (D17) | AttributionBar now shows `data as of / retrieved / licence` from `sources.json`; DataTable header carries the attribution + as-of; the fallback renders a full `SourceNote`. Report links: map hamburger menu gained a "Report a problem" item building the mailto **at click time** from `location.href`; the doc-page footer link rewrites its body at click time (inline script; build-time href remains the no-JS fallback) |
| P0-4 | The bulk-CSV `snapshot_id` column contained a **date** (`2026-08-19`) — not resolvable to any snapshot                                                                                                                                                                                                                         | It now carries the first 8 hex of the **population source content hash** (e.g. `88406d26`), recorded in `sources.json → unhcr_population.content_hash`, so any reader of a citation can resolve it. (The manifest-wide id cannot be embedded in the CSVs it hashes — chicken-and-egg; see DATA-DICTIONARY "snapshot semantics".) `datapackage.json.version` uses the same id                                                    |
| P0-5 | `ci.yml` triggered on `main` only; the repository branch is `master` → CI would never run                                                                                                                                                                                                                                      | Triggers on both                                                                                                                                                                                                                                                                                                                                                                                                                |

## 2. Data-quality guards — fixed 2026-08-24

| #   | Finding                                                                                                                                                                                                                                                                     | Fix                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1 | §7.7 step 4 (unmatched code with > 10,000 persons → source FAIL) applied **only** to `unhcr_population`; demographics/nowcasting dropped unmatched rows silently, idmc/solutions/asylum-apps bucketed them with no tripwire — the exact "silent data loss" the spec forbids | Every UNHCR source now records unmatched codes with magnitudes (`UnmatchedTracker`); `guardUnmatched()` in `run.ts` fails any source breaching the threshold; all small entries merge into one `unmatched-report.json` |
| Q-2 | §7.2 `unstable` status was dead code — a mid-run `maxPages` change (upstream publishing) surfaced as `stale`, indistinguishable from an outage                                                                                                                              | `attempt()` detects `UnstableSourceError` and writes `status: "unstable"`; `stale_since` still accrues so a _persistent_ condition escalates identically                                                               |
| Q-3 | Invariant #5 (mapped + unmappable = global total) checked **refugees only**; #6 checked stock files only; #7 never actually re-packed                                                                                                                                       | #5 now loops all 9 metrics × all years; #6 also scans every country file (packed series, demographics) and flows; #7 asserts `pack(unpack(x))` is byte-identical to the published form for every series in both views  |
| Q-4 | `retryOn` enumerated four 5xx codes; Cloudflare 52x et al. failed without retry                                                                                                                                                                                             | Any `429` or `>= 500` retries                                                                                                                                                                                          |
| Q-5 | Dead `HDX` config block (never called)                                                                                                                                                                                                                                      | Removed                                                                                                                                                                                                                |

## 3. Test-truthfulness — fixed 2026-08-24

| #   | Finding                                                                                                                                                  | Fix                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-1 | The perf e2e never measured LCP (15 s wall-clock stand-in) and estimated JS weight as `raw/4` while excluding the Plot chunk                             | Real LCP via buffered `PerformanceObserver` under a 4G CDP throttle, asserted `< 2500 ms`; JS budget brotli-compresses every `_astro/*.js` actually fetched and asserts `< 400 KB`                     |
| T-2 | The download e2e read the screen's #1 country then threw it away — "rows and values match the screen" (§13.4) was not asserted                           | Now asserts the CSV rank-1 value equals the rank-list value (within compact-format rounding) **and** the row count equals the count declared in the download dialog                                    |
| T-3 | axe coverage omitted `/about`, `/about/boundaries` and all zh-Hant routes                                                                                | Both about pages and `/zh-Hant/` added to the scan set                                                                                                                                                 |
| T-4 | §10.5 footnotes never reached the tooltip and ignored `population_type`                                                                                  | Map tooltip shows "※ n · UNHCR footnotes" (for cached country files, fed by the new hover prefetch); detail panels sort current-metric footnotes first (mapping in `src/lib/data.ts → FOOTNOTE_TYPES`) |
| T-5 | §8.5 hover prefetch fired instantly from list rows only, never from the map; `session.hover` was write-only (table/rail hover did not highlight the map) | MapCanvas: 500 ms hover-intent timer → `country/{ISO3}.json` prefetch; new `highlight` prop drives the hover outline from rank-list / table rows                                                       |
| T-6 | Citation dates rendered US-style ("December 31, 2025") vs the spec template ("31 December 2025") — locked in by a unit test                              | `fmtDateLong` uses `en-GB` for English; unit test updated to the spec's exact string                                                                                                                   |
| T-7 | D11 one-sided: nowcast card said "Estimate" but confirmed data had no counterpart badge (`source.confirmed` was dead i18n)                               | Legend title now carries the "Reported" chip                                                                                                                                                           |

## 4. Accepted deviations from the frozen spec (kept deliberately)

Each was examined and kept, with the reason recorded here and in `ARCHITECTURE.md` §3:

| Spec says                                                               | Implementation                                              | Why kept                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §9.6 "`c` not in `cmp` → add it"                                        | Selection (`c`) and comparison (`cmp`) stay independent     | Auto-adding makes _looking_ at a country mutate the comparison set — surprising and destructive to a carefully built compare URL. Compare is explicit via the `C` key / `+` button. Unit-tested as intended behaviour    |
| §8.2 island "takes over" skeleton DOM                                   | `client:only` island renders, then removes the skeleton     | Astro cannot hydrate server HTML it did not render for a `client:only` island; visual result is identical (skeleton paints first, is replaced when ready). Removal (not `hidden`) keeps one `.overlays` in the a11y tree |
| §8.3 fitBounds padding 56/+16/+16/112                                   | 72/+24/+24/120                                              | Measured against the real chrome (48 px topbar + margins); spec numbers pre-date the built layout                                                                                                                        |
| §7.9 / spec §4 `_headers` `immutable` for `/data/v1/*`                  | 24 h + stale-while-revalidate                               | Direct links (downloads, JSON-LD `contentUrl`) are fetched **without** the `?v=` hash; immutable would freeze them for a year. App fetches carry `?v=<sha8>` and still bust instantly                                    |
| §7.9 `snapshot_id` = git short hash                                     | Content-addressed digest + separate `git_commit` field      | A commit hash cannot be embedded in the files that the commit hashes. Content digest is deterministic and reproducible; `git_commit` records CI context when present                                                     |
| §7.5 IDU trimmed to "~100 KB"                                           | 3,000 newest events ≈ 1.5 MB raw / 119 KB brotli, on demand | The spec's estimate assumed heavier trimming than useful; the transfer size (brotli) matches the spec's intent and the layer is opt-in (`e=1`)                                                                           |
| §2 D11 "IDU primary"                                                    | IDU is an opt-in map layer; nowcast a collapsed card        | Both are estimates; defaulting an estimate layer ON over confirmed annual data would blur the site's confirmed-vs-estimate line. "Primary" is honoured in the sense that IDU is the only _event-level_ live source       |
| ~~`zh-Hant.json` values are English~~                                   | **Superseded 2026-08-24**: fully translated                 | The D3 "English values for MVP" allowance is retired — the whole UI, doc pages, metric definitions and caveats now ship in zh-Hant (see §7); a unit test fails the build if the file regresses to English                 |
| columnar codec also packs null-runs (`["n",n]`)                         | extension                                                   | Lossless, round-trip-tested, cuts the history file substantially                                                                                                                                                         |
| §7.4 `/countries/?limit=250` → 500; nowcast `limit=1000` → page default | —                                                           | Identical single-page results                                                                                                                                                                                            |

## 5. Deferred (priority order for the next phases)

1. ~~**Phase 2 – flow arcs**~~ — **Done 2026-08-25** (`ee5f18e`): `f=1` with a selected country
   draws the top-partner arc layer over `flows/{year}.json`; asserted end-to-end in
   `tests/e2e/flows.spec.ts`.
2. ~~**`/stories`**~~ — **Done 2026-08-25** (`ee5f18e`, `3c9fcfa`): nine data-driven stories ship
   (world, AFG, BGD, COL, HKG, RWA, SYR, UKR, VEN), each recomputed from the published data.
3. **Phase 2 – boundary-set switch** (FieldMaps/USGS public-domain set): licence-clean candidate documented on `/about/boundaries`.
4. **Phase 3 – ReliefWeb**: appname application not yet submitted (owner task, Appendix C).
5. Smaller items: focus trap limited to modals (panels are non-modal by design — revisit with a real
   screen-reader session); basemap fallback has no label layer (own-boundaries + tooltips carry the
   information); `/zh-Hant/404` (Cloudflare Pages serves a single global 404); Playwright uses a
   local static server instead of `astro preview` (preview is single-instance).
6. **Zenodo DOI for quarterly snapshots**: the success metric is citations, and the biggest
   friction for academic citation is "will this URL exist in five years". Snapshot ids and the
   git audit trail already exist — depositing a quarterly data snapshot to Zenodo (free,
   CERN-run) yields a DOI per version plus a concept DOI. **Done 2026-08-25**: concept DOI
   10.5281/zenodo.22087749 is live (v2 published); the quarterly new-version flow is scripted
   in `scripts/dev/zenodo-deposit.mjs --new-version`.

## 6. Verification of this remediation

> **Historical record — figures as of 2026-08-24.** This section is the evidence for *that*
> remediation and is deliberately not updated as the project grows; treating it as current state
> is what let "60/60 / 21/21" drift. For the live counts see `docs/ARCHITECTURE.md`
> (24 automated checks / 18 invariants) or run the suites.

- `npm run check` — 0 errors; `npm test` — 60/60 (citation template now byte-equal to the spec's example)
- `npm run etl` (cold re-run) → `etl:validate` — **21/21** with the strengthened invariants
  (#5 across 9 metrics × 75 years; #7 re-packed 20k+ series byte-identically)
- `npm run test:e2e` — full suite including real-LCP perf gate and CSV↔screen parity
- Deployed and spot-checked on the production URL (see RUNBOOK §8 for the remaining owner tasks)

## 7. Multi-expert review — implemented 2026-08-24

A second full-system review (systems-design, sociology/research, linguistics, psychology,
software-engineering lenses) triggered by the owner's report that zh-Hant "wasn't translated".
Everything below is implemented and gated (`npm run check`, 62 unit tests):

- **zh-Hant is real**: ~260 UI keys translated with a locked terminology table
  (`docs/STYLE-zh.md`); Methodology/About/Data/Boundaries pages fully bilingual; metric
  definitions and caveats carry `definition_zh`/`caveats_zh` end-to-end (ETL → JSON → UI →
  downloads); country names via `Intl.DisplayNames('zh-Hant-TW')`; full-width punctuation policy.
- **Critical bug**: `prefetchCountry` was called but never imported in `MapApp` (runtime
  ReferenceError on hover in production). Fixed; e2e now attaches `pageerror` listeners and
  asserts a hover-prefetch request (F1/F5).
- **Psychology/dignity**: legend sentence + evidence chips (Reported / IDMC estimate / Derived);
  "≈ 1 in every n people on Earth" anchor; IDU conflict coordinates snapped to a 0.25° grid at
  ETL, events <100 people not drawn individually, popups link to IDMC instead of pasting
  narrative; reporting-incentives caveat on every source.
- **Statistical honesty**: fixed class breaks across the whole year range (colour = magnitude,
  not per-year rank); sparkline gaps at nulls; `coverage_from` (stateless 2004, OIP 2018) hatches
  the timeline and explains "not collected before {year}".
- **Researcher workflow**: provenance `#` comments ship by default (opt-out = strict RFC 4180);
  columns renamed `population_snapshot_id` (bulk) / `dataset_snapshot_id` (view CSV); YoY Δ
  column in the table and `yoy_delta` in every export; `world-totals.json` + "share of world
  total" on country pages; citations use the data year, `@dataset` BibTeX with `version`.
- **Ops**: dead-man's-switch chip when `manifest.generated_at` is >10 days old; `unstable`
  sources escalate the 3-day alarm; `npm run deploy` refuses a dirty tree and stamps the commit
  into `dist/build-info.json` (S4); UA/homepage strings pinned (S8).
- Deferred from this round: dynamic-import of dialog/table islands (F8 — bundle already within
  budget); `live/*` commit-growth policy (S9); Cloudflare GitHub-App check cleanup (S3, needs
  dashboard access); GitHub Actions billing gate (owner decision).
