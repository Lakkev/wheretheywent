# DATA DICTIONARY

Definitions, units, coverage and caveats for every field published under `public/data/v1/`.
Machine-readable equivalents: `metrics.json` (metrics), `sources.json` (provenance), `datapackage.json`
(CSV table schemas).

## Conventions

- **Key**: ISO 3166-1 alpha-3 (`SYR`). Pseudo keys for non-country reporting entities:
  `XXA` Stateless (origin), `UNK` Unknown origin, `TIB` Tibetan (origin), `CRB` Caribbean aggregate,
  `AB9` Abyei Area (IDMC), `OTH` small unmatched entities, `XKX` Kosovo (geometry only),
  `_NCY` / `_SOL` boundary-only geometry (never filled, never in data).
- **Unit**: persons, integers. **`null` = not reported** (UNHCR `"-"`), **`0` = reported zero**.
- **Time**: year-end stocks (31 December) unless stated; flows are for the calendar year; WPP
  population is 1 July.
- **Packed series** (`stock/*.json`, `country/*.json`): arrays aligned with `years`; a cell is an
  integer, `null`, `["z", n]` (n zeros) or `["n", n]` (n nulls). Decode with `src/lib/columnar.ts`.

## Metrics (index order = array position in `v` arrays)

| #   | id                  | label                                            | definition                                                                                                                                       | source                            | views            | caveats                                           |
| --- | ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------- | ------------------------------------------------- |
| 0   | `refugees`          | Refugees                                         | Recognised refugees (1951 Convention, OAU Convention, UNHCR Statute), complementary/subsidiary/temporary protection, and refugee-like situations | `unhcr_population`                | asylum, origin   | Excludes ~6 M UNRWA-registered Palestine refugees |
| 1   | `asylum_seekers`    | Asylum-seekers                                   | Persons with pending claims for international protection at year-end                                                                             | `unhcr_population`                | asylum, origin   | Persons, not cases                                |
| 2   | `idps`              | Internally displaced persons                     | Conflict/violence IDPs compiled by IDMC, reported by UNHCR; counted in their own country                                                         | `unhcr_idmc` (via `/population/`) | both (identical) | No disaster displacement                          |
| 3   | `stateless`         | Stateless persons                                | Persons not considered nationals by any State (incl. undetermined nationality)                                                                   | `unhcr_population`                | asylum           | Many countries do not report                      |
| 4   | `ooc`               | Others of concern                                | Persons to whom UNHCR extends protection/assistance outside the other categories                                                                 | `unhcr_population`                | asylum, origin   |                                                   |
| 5   | `returned_refugees` | Returned refugees                                | Refugees who returned to their country of origin during the year                                                                                 | `unhcr_population`                | asylum, origin   | Flow                                              |
| 6   | `returned_idps`     | Returned IDPs                                    | IDPs who returned to their area of origin during the year                                                                                        | `unhcr_population`                | asylum, origin   | Flow                                              |
| 7   | `oip`               | Other people in need of international protection | People abroad likely in need of protection whose status is undetermined (mostly Venezuelans, 2018+)                                              | `unhcr_population`                | asylum, origin   | Reported since 2018                               |
| 8   | `hst`               | Host community                                   | Host-community members benefiting from UNHCR programmes                                                                                          | `unhcr_population`                | asylum           | Not displaced; excluded from totals               |
| —   | `total_poc`         | Total people of concern (derived, client-side)   | refugees + asylum_seekers + idps + stateless + ooc + oip                                                                                         | —                                 | both             | null only if all components null                  |

## Files

### Snapshot semantics (three ids, all resolvable)

| Where                                                 | Value                                                 | Resolve via                                    |
| ----------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `manifest.json → snapshot_id`                         | first 8 hex of sha256 over all published file hashes  | `manifest.json` itself                         |
| bulk CSV `snapshot_id` column · `datapackage.version` | first 8 hex of the **population source** content hash | `sources.json → unhcr_population.content_hash` |
| client "this view" CSV/JSON downloads                 | `manifest.snapshot_id` of the dataset the app loaded  | `manifest.json`                                |

The manifest-wide id cannot be embedded inside the CSVs it hashes (it would change them);
the population content hash identifies the exact upstream payload behind every number.

### `manifest.json`

`snapshot_id` (8-hex content hash), `git_commit` (when built in CI), `generated_at` (last time any
file changed), `year_min`, `year_max`, `stock_files` (load order), `files{path:{sha256,bytes}}`.

### `sources.json` → `Record<source_id, SourceEntry>`

`publisher`, `title`, `landing_page`, `license{id,url}`, `attribution` (the exact string required by
the licence), `data_as_of` (YYYY-MM-DD), `period_type`, `retrieved_at` (only advances on content
change), `coverage{year_min,year_max}`, `content_hash`, `status` (`ok|stale|unstable`),
`stale_since`, `last_error`, `caveats[]`, `caveats_zh[]`, `endpoints[]`.
Source ids: `unhcr_countries`, `unhcr_population`, `unhcr_demographics`, `unhcr_idmc`,
`unhcr_solutions`, `unhcr_asylum_applications`, `unhcr_footnotes`, `unhcr_nowcasting`,
`wpp_population`, `idmc_idu`, `natural_earth`.

### `countries.json`

`count`, `regions[{slug,name}]`, `countries[]` with: `iso3`, `iso2`, `name` (UNHCR name — kept
for citation fidelity), `display_name`, `display_name_zh?`, `unhcr_code` (audit only, never a key),
`region` (UN major area), `region_slug`, `centroid [lon,lat]`, `bbox [w,s,e,n]` (east may exceed
180 for antimeridian-crossing countries), `in_unhcr`, `in_geo` (drawable), `in_wpp`, `note?`,
`note_zh?`.

### `stock/{from}-{to}.json`

`years[]`, `metrics[]` (= METRIC_IDS), `asylum{ISO3:{v:PackedSeries[9]}}`,
`origin{…}`, `population{ISO3:PackedSeries}` (WPP persons), `totals{asylum:PackedSeries[9],
origin:…}` (sum over all entities incl. pseudo keys), `unmappable[]` (keys with data but no
drawable geometry), `sources[]`, `snapshot`.

### `country/{KEY}.json`

`meta` (CountryMeta), `years[]` (full range), `metrics[]`, `asylum.v`, `origin.v`, `population`,
`demographics[]` (`year`, `f[7]`, `m[7]` = 0–4, 5–11, 12–17, 18–59, 60+, other, total; `total`),
`top_origins{year:[{p,refugees,asylum_seekers}]}` (top-10 origins of people hosted here, 2000+),
`top_hosts{…}` (top-10 hosts of people from here), `solutions[]` (origin perspective:
`returned_refugees`, `resettlement`, `naturalisation`, `returned_idps` per year, 2000+),
`solutions_host[]` (host perspective), `asylum_applications{host[],origin[]}` (`applied`, persons
only, 2015+), `idmc[]` (`year`, `total` IDP stock, 2009+), `footnotes[]` (`year|null`,
`population_type`, `text`, `view`), `sources[]`.

### `flows/{year}.json` (2015+, Phase 2 input)

`rows: [origin, asylum, refugees, asylum_seekers][]` — zero rows removed.

### `live/nowcast.json`

UNHCR nowcasting _estimates_: `period` (YYYY-MM), `rows[{iso3,refugees,asylum_seekers,source}]`,
`total_refugees`, `total_asylum_seekers`. Never merged into annual series.

### `live/idu-latest.json`

IDMC Internal Displacement Updates (preliminary, last 180 days): `since`, `until`, `count`,
`by_country{ISO3:{events,figure}}`, `events[{id,iso3,country,lat,lon,figure,type,
displacement_date,created_at,text,url}]` (`text` is sanitised plain text, ≤500 chars; newest
3,000 events kept).

### `geo/world-50m.topo.json`, `geo/geo-index.json`, `geo/disputed-notes.json`

TopoJSON (`objects.countries`, geometry `id` = ISO3), per-feature centroid/bbox/fill flag, and the
bilingual disputed-territory notes shown in the boundaries modal/page.

### `downloads/*.csv`

See `datapackage.json`. All CSVs: UTF-8, LF, RFC 4180, header row, empty field = null.

- `unhcr-population-all-years.csv` — long: `iso3,country_name,view,year,metric,value,unit,source_id,source_attribution,data_as_of,retrieved_at,snapshot_id`
- `unhcr-population-by-asylum.csv` / `-by-origin.csv` — wide: one row per entity × year, one column per metric
- `countries.csv`, `wpp-total-population.csv`

### Client-side downloads ("this view")

`iso3,country_name,view,year,metric,value,unit,per_1000_residents,population,rank,source_id,
source_attribution,data_as_of,retrieved_at,snapshot_id` (+ optional `#` comment lines when the
user opts in).

## Known entity quirks

| Entity                                                                                                     | Behaviour                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kosovo `XKX`                                                                                               | Drawn; no UNHCR data (included in Serbia `SRB`); WPP population present                                                                               |
| Taiwan `TWN`                                                                                               | Drawn; no UNHCR data at all; WPP population present (name "China, Taiwan Province of China" in WPP) — display policy (c), pending client confirmation |
| Serbia `SRB`                                                                                               | UNHCR name "Serbia and Kosovo: S/RES/1244 (1999)", shown as "Serbia" with the original name alongside                                                 |
| Palestine `PSE`                                                                                            | UNHCR figures exclude UNRWA-registered refugees                                                                                                       |
| Western Sahara `ESH`                                                                                       | Drawn and filled with UNHCR data                                                                                                                      |
| Martinique `MTQ`, Gibraltar `GIB`, Tuvalu `TUV`, Svalbard `SJM`, Bouvet `BVT`, French overseas departments | UNHCR entities without their own polygon → "unmappable" list, still in totals/tables/downloads                                                        |
| `XXA`, `UNK`, `TIB`, `CRB`, `AB9`, `OTH`                                                                   | Data-only pseudo entities                                                                                                                             |
