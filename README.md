# Where They Went · 他們去了哪裡

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22087749.svg)](https://doi.org/10.5281/zenodo.22087749)

Global forced-displacement data platform for anyone who needs a checkable number: an interactive
world map of refugees, asylum-seekers, internally displaced and stateless people by country and
year (1951–latest), with sources, as-of dates, permanent links, citations and downloads for every
number. Data: UNHCR, IDMC, UN WPP. No server, no tracking, zero hosting cost.

**Status**: live at <https://wheretheywent.lakkev.com> (mirror: <https://wheretheywent.pages.dev>).
Data refreshes daily via an unattended pipeline (fetch → validate 18 invariants (24 automated checks) → publish →
build → deploy); quarterly snapshots are archived on Zenodo
([DOI 10.5281/zenodo.22087749](https://doi.org/10.5281/zenodo.22087749)).

## Quick start

```bash
npm ci                                   # installs deps, vendors the MapLibre worker
ETL_CACHE=1 npm run etl                  # fetch upstream → .etl-staging (≈3 min cold)
npm run etl:validate && npm run etl:promote
npm run dev                              # http://localhost:4321
```

Quality gates: `npm run check` · `npm test` (full unit suite) · `npm run build && npm run test:e2e`
(Playwright specs incl. axe, share-link reproduction, page-error tracking, WebGL/basemap
fallbacks). Deploy with `npm run deploy` (dirty-tree guard + commit stamp).

The site ships in seven languages (English, 繁體中文, 简体中文, Français, Español, 日本語, 한국어) — UI, methodology, metric definitions, caveats and downloads; zh terminology is locked in `docs/STYLE-zh.md` and key-parity is enforced by unit tests.

## Documents

|                             |                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------- |
| `SPEC.md`                   | The frozen specification (requirements, data traps, architecture, delivery plan) |
| `docs/ARCHITECTURE.md`      | Every decision and _why_; budgets; how to change things                          |
| `docs/RUNBOOK.md`           | Non-engineering operations guide ("I received an alert")                         |
| `docs/DATA-DICTIONARY.md`   | Every field, unit, caveat                                                        |
| `docs/data-verification.md` | Manual reconciliation log and golden numbers                                     |
| `DATA-LICENSE.md`           | Upstream licences and required attribution                                       |

## Licence

Code: MIT (see `LICENSE`). Data: original
open licences (CC BY 4.0 UNHCR, CC BY-IGO IDMC, CC BY 3.0 IGO UN WPP, public domain Natural Earth).

## Display policies

- Taiwan display policy: option **(c)** (independent feature; sourced entirely from upstream classifications) — documented on `/about/boundaries`.
