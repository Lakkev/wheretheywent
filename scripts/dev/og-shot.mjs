/**
 * Regenerate the og:image card: a 1200×630 screenshot of the live map.
 *   node scripts/dev/og-shot.mjs [url]   (default: production)
 * Commit public/og/default.png afterwards — it is referenced by every page's <head>.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'https://wheretheywent.pages.dev/';
mkdirSync('public/og', { recursive: true });
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => {
    const m = window.__wtwMap;
    return (
      !!m &&
      typeof m.isSourceLoaded === 'function' &&
      m.isSourceLoaded('wtw-countries') &&
      m.queryRenderedFeatures(undefined, { layers: ['wtw-fill'] }).length > 0
    );
  },
  null,
  { timeout: 60000 },
);
await page.waitForTimeout(2500); // let basemap tiles and labels settle
await page.screenshot({ path: 'public/og/default.png' });
console.log('saved public/og/default.png');
await b.close();
