# Where They Went · 他們去了哪裡

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22087749.svg)](https://doi.org/10.5281/zenodo.22087749)

Global forced-displacement data platform for anyone who needs a checkable number: an interactive
world map of refugees, asylum-seekers, internally displaced and stateless people by country and
year (1951–latest), with sources, as-of dates, permanent links, citations and downloads for every
number. Data: UNHCR, IDMC, UN WPP. No server, no tracking, zero hosting cost.

**Status**: MVP complete (batches ①–⑥ of `SPEC.md`) and **deployed**:
<https://wheretheywent.pages.dev> → <https://wheretheywent.lakkev.com> (pending one DNS record).
Remaining setup steps: `docs/RUNBOOK.md` §8.

## Quick start

```bash
npm ci                                   # installs deps, vendors the MapLibre worker
ETL_CACHE=1 npm run etl                  # fetch upstream → .etl-staging (≈3 min cold)
npm run etl:validate && npm run etl:promote
npm run dev                              # http://localhost:4321
```

Quality gates: `npm run check` · `npm test` (62 unit tests) · `npm run build && npm run test:e2e`
(Playwright specs incl. axe, share-link reproduction, page-error tracking, WebGL/basemap
fallbacks). Deploy with `npm run deploy` (dirty-tree guard + commit stamp).

The site is fully bilingual (English / 繁體中文) — UI, methodology, metric definitions, caveats
and downloads; terminology is locked in `docs/STYLE-zh.md`.

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

Code: all rights reserved (see `LICENSE`) — public for transparency and audit. Data: original
open licences (CC BY 4.0 UNHCR, CC BY-IGO IDMC, CC BY 3.0 IGO UN WPP, public domain Natural Earth).

## Pending decisions (Appendix C of the spec)

- Taiwan display policy: option **(c)** implemented by default (independent feature, "no data", explained on `/about/boundaries`); awaiting confirmation.
- Project e-mail, GitHub organisation, Cloudflare account, custom domain.
