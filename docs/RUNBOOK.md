# RUNBOOK — what to do when something happens

> Written for the site owner, **no programming required**. Every procedure below is either
> "do nothing, it heals itself", "click one button", or "paste this message to the AI assistant".
> When in doubt: the website never breaks because of an upstream problem — it keeps showing the last
> good data and says so with a small amber chip.

---

## 0. The mental model (2 minutes)

- **Where the numbers come from**: UNHCR (refugees etc.), IDMC (internal displacement), UN Population
  Division (population). We never type numbers in by hand.
- **What runs automatically**: every day at 03:17 UTC a robot ("the ETL") on GitHub downloads the
  latest figures, checks them (21 automatic checks), and — _only if something changed_ — commits the
  new data files. the same workflow then builds and publishes the site within a few minutes (wrangler direct upload).
- **Where things live**
  - Code + data: the GitHub repository (`public/data/v1/` is the data).
  - Website hosting: Cloudflare Pages (free; the daily workflow builds and uploads — Cloudflare itself does not rebuild).
  - Alerts: a pinned GitHub issue named **"ETL alerts"**. Subscribe to it (bell icon) to get e-mails.
- **Three dates you will see**: _data as of_ (what the data covers, e.g. 31 Dec 2025), _retrieved_
  (when we downloaded it), _snapshot_ (an 8-character id of the whole dataset).

---

## 1. "I received an ETL alert e-mail"

An e-mail from GitHub with a comment on the "ETL alerts" issue means one of the daily runs failed.

1. **Nothing is broken for visitors.** The site shows the previous snapshot; the top bar shows
   "Some data updates are delayed (since …)".
2. Open the link in the e-mail → the failed run → scroll to the red step. Typical cases:

| What the log says                                            | Meaning                                                               | What to do                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `HTTP 5xx` / `ETIMEDOUT` / `fetch failed` on `api.unhcr.org` | UNHCR is down or slow                                                 | **Do nothing.** It retries tomorrow. If the amber chip is still there after 3 days, go to §3. |
| `UnstableSourceError` / a source shows status `unstable`     | UNHCR was publishing new data while we downloaded                     | **Do nothing.** Tomorrow's run will be clean.                                                 |
| `#13 ★ golden numbers … expected X, got Y`                   | UNHCR changed a published figure (revision) _or_ changed a definition | Go to §4 — a human must look.                                                                 |
| `#4 global totals drift`                                     | Totals moved > 20 % vs yesterday                                      | Go to §4.                                                                                     |
| `unmatched codes with >10,000 persons`                       | UNHCR added a new country/code we don't know                          | Go to §5.                                                                                     |
| `promote … stale for ≥ 3 days`                               | A source has been failing for 3+ days                                 | Go to §3.                                                                                     |
| anything about `npm ci`, `node`, `Cannot find module`        | a dependency/update broke the pipeline                                | Go to §6.                                                                                     |

3. To re-run by hand: GitHub → **Actions** → **etl-daily** → **Run workflow** → green button.

---

## 2. "The amber chip says data updates are delayed"

That is the intended behaviour while a source fails. Click the chip to see which source and since
when. If it has been there for more than **3 days**, you will also have received an alert (→ §1/§3).

---

## 3. "A source has been failing for days"

1. Check the upstream yourself: open <https://api.unhcr.org/population/v1/years/> (should show a list
   of years), <https://population.un.org/wpp/> and <https://www.internal-displacement.org/> in a
   browser. If they are down, it is not us — wait.
2. If they work in the browser but the robot still fails, paste this to the AI assistant:

> "The etl-daily workflow has failed for N days with this log: <paste the red step>. Please diagnose
> and fix. Start by reading docs/ARCHITECTURE.md and scripts/etl/config.ts; do not change
> scripts/etl/lib/codes.ts semantics."

---

## 4. "Golden numbers or drift check failed"

These checks exist to catch UNHCR silently _changing what a number means_. A failure is a _stop and
look_, not an error in our code.

1. Open <https://www.unhcr.org/refugee-statistics/> (Refugee Data Finder). Look up the figure named in
   the log (e.g. _Türkiye, refugees, 2024_).
2. If UNHCR now publishes the new value (a revision): paste to the AI assistant:

> "Golden number `<id>` changed upstream to `<new value>` (verified on unhcr.org on <date>). Update
> `GOLDEN` in scripts/etl/config.ts and record it in docs/data-verification.md."

3. If the site's number is _not_ what UNHCR shows: paste the log and the correct figure to the AI
   assistant and ask for a diagnosis — do not edit data files by hand.

---

## 5. "Unmatched code with many people"

UNHCR added a reporting entity we cannot map to a country code. Paste to the AI assistant:

> "The ETL reports unmatched code `<CODE>` with `<N>` persons. Look it up in the UNHCR /countries/
> list (iso field), add an override in scripts/etl/lib/codes.ts (ISO_OVERRIDES) and, if it is a
> drawable country, in scripts/etl/geo/overrides.json. Add a unit test."

---

## 6. "Dependencies / monthly update PR"

Once a month Renovate opens one pull request with all dependency updates. CI runs the full test
suite on it.

- CI green → click **Merge**.
- CI red → do not merge; paste the failing step to the AI assistant: "Renovate PR #N fails CI with
  <log>. Fix or pin the offending package; keep the stack versions documented in ARCHITECTURE.md."

---

## 7. "A reader reports a wrong number / boundary / name"

1. Ask for the share link (the _Copy link_ button) — it reproduces exactly what they saw.
2. Numbers: check against unhcr.org (→ §4). Most reports turn out to be _not reported vs zero_
   (grey vs the lightest sand colour) or _UNRWA not included_ — both are explained on the methodology page;
   reply with the link.
3. Boundaries/names: see `/about/boundaries`. Changes to how a place is drawn or named are policy
   decisions — decide, then ask the AI assistant to update `scripts/etl/geo/overrides.json`,
   `scripts/etl/lib/display-overrides.json` and `scripts/etl/geo/disputed-notes.json`.

---

## 8. Current production configuration (updated 2026-08-26)

Everything below is LIVE — this section records what exists, so it can be rebuilt if lost.

- **Domain**: `wheretheywent.lakkev.com` — proxied CNAME to `wheretheywent.pages.dev`
  on the `lakkev.com` zone. Mirror: `wheretheywent.pages.dev`.
- **Repository**: <https://github.com/Lakkev/wheretheywent> (public; code MIT-licensed).
- **Deployment**: the daily `etl-daily` workflow builds and uploads `dist/` via wrangler
  (direct upload), gated on the `CLOUDFLARE_API_TOKEN` repo secret (Pages:Edit scope).
  Manual fallback: `npm run deploy` (dirty-tree guard, commit stamp, wrangler upload).
- **Actions configuration**: workflow permissions Read-and-write; pinned issue #1 "ETL alerts";
  repo variables `PUBLIC_SITE_URL`, `PUBLIC_CONTACT_EMAIL` (the public project mailbox),
  `CLOUDFLARE_ACCOUNT_ID`; secret `CLOUDFLARE_API_TOKEN`.
- **Zone setting**: Scrape Shield → Email Address Obfuscation stays **off**
  (otherwise no-JS readers and archives see `[email protected]`).

**Recurring operations**

1. **Quarterly Zenodo deposit** (DOI archive). Concept DOI `10.5281/zenodo.22087749` always
   resolves to the latest version. Each quarter: ensure `ZENODO_TOKEN` is in the local,
   gitignored `.env`, then run `scripts/dev/zenodo-deposit.mjs --new-version` — the flow
   branches off deposition 22087750 so versions chain under one concept DOI. Never create
   a fresh deposition. Publishing is permanent.
2. **Renovate** (GitHub app) for the monthly dependency PR, if enabled.

**Disaster recovery (rebuild from scratch)**

- DNS: Cloudflare dashboard → lakkev.com → DNS → add CNAME `wheretheywent` →
  `wheretheywent.pages.dev`, proxied.
- Pages project: `npx wrangler pages project create wheretheywent --production-branch master`,
  then `npm run deploy`.
- Secrets: re-issue a Cloudflare API token (minimal Pages:Edit scope) and store it with
  `gh secret set CLOUDFLARE_API_TOKEN`; re-add the repo variables listed above. Tokens live
  only in GitHub secrets and the local gitignored `.env` — never in the repo.

## 9. Things that are deliberately **not** possible

- Editing a number by hand (all data comes from the pipeline; edit the rules, not the data).
- Showing individual people or locations (design red line, see About).
- Collecting donations on the site (legal/financial reasons, see About).
