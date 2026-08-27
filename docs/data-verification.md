# Data verification log (manual reconciliation)

Automated checks (`scripts/etl/validate.ts`) catch structural problems and drift against our own
previous snapshot and against the hard-coded _golden numbers_ in `scripts/etl/config.ts`. They
cannot catch a wrong _reading_ of the API (semantic errors). This log records the manual
reconciliations that close that gap (spec §13.3): whenever something major changes (new year
published, upstream definition change, ETL refactor), a person checks **5 countries × 3 years** on
<https://www.unhcr.org/refugee-statistics/> (Refugee Data Finder) against this site and records it here.

## How to verify

1. Open the Refugee Data Finder, choose _Country of asylum_ (or _origin_), the year and the
   population type.
2. Open `/country/<ISO3>?y=<year>` on the site (or `public/data/v1/country/<ISO3>.json`).
3. Compare. Values must match exactly (year-end stocks). A mismatch means either an upstream
   revision (then update the golden number and note it here) or a parsing bug (fix first).

## Golden numbers currently enforced

| id                    | query                                              | expected   | verified on | by                                                                                     |
| --------------------- | -------------------------------------------------- | ---------- | ----------- | -------------------------------------------------------------------------------------- |
| `tur-refugees-2024`   | Türkiye, country of asylum, refugees, 2024         | 2,940,735  | 2026-08-19  | API direct call (`?year=2024&coa=TUR&cf_type=ISO`) — matches Global Trends 2024 (2.9M) |
| `syr-idps-2016`       | Syria, IDPs, 2016                                  | 6,325,978  | 2026-08-19  | API direct call (`?year=2016&coo=SYR&cf_type=ISO`) — matches Global Trends 2016 (6.3M) |
| `world-refugees-2024` | World total refugees (sum of `coa_all` rows), 2024 | 30,958,200 | 2026-08-19  | API direct call; Global Trends 2024 reports 31.0M under UNHCR mandate (excl. UNRWA)    |

Tolerance: 1 % (`THRESHOLDS.goldenTolerance`). Any failure blocks promotion of the core group.

## Bilateral matrix ↔ marginal totals (invariant #16)

The origin × asylum bilateral matrix (`flows/{year}.json`, 2015+, refugees and asylum-seekers)
comes from a **separate API query** (`coo_all & coa_all`) than the marginals in `stock/*`
(`coa_all` alone / `coo_all` alone). Invariant #16 asserts that summing the matrix over asylum
countries reproduces every origin marginal, and summing over origin countries reproduces every
asylum marginal. A country whose marginal is `null` (not reported) must also have no bilateral
rows.

**Exact equality was not assumed.** UNHCR redacts/rounds small cells and uses pseudo-entities
(`XXA` stateless, `UNK` unknown, `OTH` others), any of which could make the three queries
disagree. Measured on snapshot `2d5eacdf` (2026-08-27,
`node scripts/dev/measure-bilateral.mjs public/data/v1`): all **8,152** populated
(side × country × year × metric) cells — 8,344 including
zero-marginal cells — match **exactly**, worst |Δ| = 0. UNHCR evidently applies its redaction
consistently across the three queries, so the published marginals are the sums of the published
(possibly redacted) cells.

**Tolerance**: a cell passes when |Σ bilateral − marginal| ≤ max(**1,000 persons**, **0.5 %** of
the larger side) — `THRESHOLDS.bilateralAbsTolerance` / `bilateralRelTolerance`. Rationale: the
measured discrepancy today is zero, but the tolerance is deliberately non-zero. If UNHCR ever
applies suppression asymmetrically (bilateral cells hidden while marginals keep the true total),
per-cell rounding across ~200 partner countries could plausibly accumulate to a few hundred
persons per marginal, which should not block the daily publish. The defects this guard exists to
catch — a dropped API page, a mis-keyed country, double counting — are orders of magnitude larger
(verified: a 50,000-person perturbation of one cell fails the guard on both its origin row and its
asylum column). Any failure blocks promotion of the core group. Before widening the tolerance,
re-measure the actual distribution with the same method and record the result here.

## Reconciliation log

| date       | who                 | what was checked                                                                                                                                                        | result                |
| ---------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 2026-08-19 | initial build (AI)  | Austria/Australia, Egypt/UAE, Martinique/Morocco keying (collision golden cases) — `countries.json` names vs ISO3; `AUT` named "Austria", `AUS` named "Australia", etc. | ✅ pass (validate #2) |
| 2026-08-19 | initial build (AI)  | TUR 2024 refugees / SYR 2016 IDPs / world 2024 refugees vs API                                                                                                          | ✅ exact match        |
| _(next)_   | client / maintainer | Pick 5 countries × 3 years on unhcr.org and record here                                                                                                                 | —                     |

## Known semantic caveats (do not "fix" these)

- **UNRWA**: UNHCR figures exclude ~6 million Palestine refugees registered with UNRWA. The site
  says so on every relevant surface (metric caveats, Palestine note).
- **IDPs** come from IDMC via UNHCR's `/population/` and `/idmc/` endpoints; conflict/violence
  only, no disaster displacement.
- **`"-"` vs `0`**: not reported vs reported zero. Stored as `null` vs `0` everywhere; CSV shows
  an empty field vs `0`.
- **Kosovo** is included in Serbia's figures (UNHCR entity "Serbia and Kosovo: S/RES/1244 (1999)").
- **Taiwan** has no UNHCR figures at all (not merged anywhere); it is drawn from Natural Earth with
  UN WPP population only.
- **Year-end vs mid-year**: displacement stocks are 31 December; WPP population is 1 July of the
  same year (per-1,000 rates mix the two — stated in the methodology).
