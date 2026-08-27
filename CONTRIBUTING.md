# Contributing

Thank you for your interest. The most valuable contribution to this project is
**criticism of its methodology** — see the open review process at
<https://wheretheywent.lakkev.com/review>. Every comment and our response is
published in full.

## Reporting problems

- **A number looks wrong / a caveat is missing** — open a GitHub issue with the
  permanent link of the view (every view's URL reproduces it exactly) and, if
  possible, the upstream source you checked against.
- **Bugs (UI, data pipeline, accessibility)** — open an issue with steps to
  reproduce. Every page has a "report a problem" link that pre-fills the exact URL.

## Code contributions

1. Fork, branch, and keep changes focused.
2. `npm ci && npm run build` must pass, along with the gates:
   `npx tsc --noEmit`, `npx vitest run` (unit), `npx playwright test` (e2e),
   and `npm run validate:data` (22 data invariants).
3. Two hard principles reviewers will hold you to:
   - **"Not reported" is never rendered as zero.** Missingness is information.
   - **Data-level strings (metric definitions, caveats) ship in all seven
     languages** — see `scripts/etl/lib/metrics-i18n.ts`; a guard test fails
     the build if any locale is missing.
4. By contributing you agree your contribution is licensed under the MIT licence.

## What we will not merge

Anything that presents individual-level data, softens a caveat, or renders a
missing value as a number. These are red lines, not style preferences.
