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
  new data files. Cloudflare then rebuilds and publishes the site within a few minutes.
- **Where things live**
  - Code + data: the GitHub repository (`public/data/v1/` is the data).
  - Website hosting: Cloudflare Pages (free; rebuilds on every commit).
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
   (grey vs light blue) or _UNRWA not included_ — both are explained on the methodology page;
   reply with the link.
3. Boundaries/names: see `/about/boundaries`. Changes to how a place is drawn or named are policy
   decisions — decide, then ask the AI assistant to update `scripts/etl/geo/overrides.json`,
   `scripts/etl/lib/display-overrides.json` and `scripts/etl/geo/disputed-notes.json`.

---

## 8. First-time setup — current state (2026-08-22)

**Already done** (by the AI session on 2026-08-22):

- [x] Cloudflare Pages project `wheretheywent` created and deployed (direct upload).
      Live at <https://wheretheywent.pages.dev>.
- [x] Custom domain `wheretheywent.lakkev.com` registered on the Pages project (status: _pending_
      until the DNS record below exists).
- [x] GitHub repository <https://github.com/Lakkev/wheretheywent> created (public).
- [x] Site URL baked in as `https://wheretheywent.lakkev.com` (canonical, JSON-LD, citations, sitemap).

**Still to do — needs you** (each is one or two clicks/commands):

1. **DNS record** (makes the custom domain live). Cloudflare dashboard → **lakkev.com** → **DNS** →
   **Add record**: type `CNAME`, name `wheretheywent`, target `wheretheywent.pages.dev`,
   proxy **on** (orange cloud) → Save. The certificate provisions within a few minutes.
   _(The CLI token used by the AI has no DNS-write permission, which is why this is manual.)_
2. **Push the code** (the repo exists but is still empty — the CLI token lacks the `workflow`
   scope needed to upload `.github/workflows/`). In a terminal:
   ```
   gh auth refresh -h github.com -s workflow
   ```
   Follow the browser prompt, then tell the AI assistant "done" and it will push.
3. **Project mailbox**. `PUBLIC_CONTACT_EMAIL` is `roccafcheng@gmail.com` (a real inbox — the
   owner's public project address; WeChat `palaceofversailles` is shown alongside it on
   /about and /support). Disable **Scrape Shield → Email Address Obfuscation** for the zone:
   otherwise crawlers, archives and no-JS readers see the literal text `[email protected]`
   instead of the address — bad for a journalist audience.
4. **After the push**: repo → Settings → Actions → Workflow permissions → **Read and write**;
   create an issue titled **"ETL alerts"**, pin it, subscribe (it must be issue #1, or change
   `ALERT_ISSUE_NUMBER` in `.github/workflows/etl-daily.yml`); Settings → Secrets and variables →
   Actions → Variables: `PUBLIC_SITE_URL=https://wheretheywent.lakkev.com`,
   `PUBLIC_CONTACT_EMAIL=roccafcheng@gmail.com`.
5. **Automatic redeploys**. Right now deployments are manual — use `npm run deploy`
   (it refuses a dirty working tree, builds, stamps the commit into `dist/build-info.json`,
   then uploads via wrangler). To make the daily ETL publish
   by itself, pick one:
   - _Git integration_ (spec default): Cloudflare → Workers & Pages → wheretheywent → Settings →
     Builds → Connect to Git → this repo; build command `npm run build`, output `dist`,
     env `NODE_VERSION=22.22.2` + the two `PUBLIC_*` variables.
   - _Deploy from Actions_: create a Cloudflare API token (Pages:Edit) and add it as the repo
     secret `CLOUDFLARE_API_TOKEN`; the AI can then add a deploy step to `etl-daily.yml`.
6. Enable Renovate (GitHub app) for the monthly dependency PR.

## 9. Things that are deliberately **not** possible

- Editing a number by hand (all data comes from the pipeline; edit the rules, not the data).
- Showing individual people or locations (design red line, see About).
- Collecting donations on the site (legal/financial reasons, see About).
