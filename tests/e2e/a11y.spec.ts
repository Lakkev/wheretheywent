import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** WCAG 2.2 AA gate: zero critical/serious violations on three pages (spec §13.4). */
const PAGES = ['/', '/country/SYR', '/methodology', '/data', '/compare?cmp=TUR,DEU'];

for (const path of PAGES) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path);
    if (path === '/')
      await page.waitForSelector('.overlays:not([hidden]) .ranklist li .val', { timeout: 30_000 });
    else await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('.maplibregl-canvas')
      .exclude('figure.chart svg')
      .exclude('.compare-app svg')
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    for (const v of bad)
      console.log(
        `[axe] ${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join('\n  ')}`,
      );
    expect(bad, bad.map((v) => v.id).join(', ')).toEqual([]);
  });
}
