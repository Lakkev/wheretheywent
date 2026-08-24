import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

const PAGES = [
  '/zh-Hant/',
  '/zh-Hant/about/',
  '/zh-Hant/methodology/',
  '/zh-Hant/country/SYR/',
  '/zh-Hant/data/',
];

test('zh-Hant pages: lang attribute, no raw i18n keys in the DOM', async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p);
    if (p === '/zh-Hant/') await waitForApp(page);
    expect(await page.locator('html').getAttribute('lang')).toBe('zh-Hant');
    const text = await page.locator('body').innerText();
    // raw keys look like "nav.map" / "metric.refugees" — must never leak
    expect(text).not.toMatch(
      /\b(nav|metric|view|scale|legend|timeline|rail|table|detail|compare|source|cite|download|share|keys|map|country|page|common|a11y)\.[a-z][a-zA-Z0-9_.]+\b/,
    );
    // hreflang alternates present
    expect(await page.locator('link[rel=alternate][hreflang=en]').count()).toBe(1);
  }
});

test('language switch keeps the query string', async ({ page }) => {
  await page.goto('/?y=2016&m=idps');
  await waitForApp(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: '繁體中文' }).click();
  await page.waitForURL(/\/zh-Hant\/\?y=2016&m=idps/);
  await waitForApp(page);
  expect(await page.locator('.timeline .year').textContent()).toBe('2016');
});

test('perf: LCP < 2.5 s on 4G throttle; first-view JS < 400 KB brotli (spec §13.4)', async ({
  page,
  context,
}) => {
  // Real LCP via PerformanceObserver (buffered) — injected before any document script runs.
  await page.addInitScript(() => {
    (window as unknown as { __lcp: number }).__lcp = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        (window as unknown as { __lcp: number }).__lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  // 4G profile: 4 Mbps down, 60 ms RTT (Chrome DevTools "Fast 4G" ballpark)
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 60,
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (1 * 1024 * 1024) / 8,
  });
  // Measure the REAL compressed transfer: brotli every JS chunk actually requested on first view
  // (the local test server sends identity encoding, production sends br).
  const { brotliCompressSync } = await import('node:zlib');
  let jsBrotli = 0;
  const chunks: string[] = [];
  page.on('response', (r) => {
    const u = r.url();
    if (!/\/_astro\/.*\.js$/.test(u)) return;
    chunks.push(u.split('/').pop()!);
    void r
      .body()
      .then((b) => (jsBrotli += brotliCompressSync(b).length))
      .catch(() => {});
  });
  await page.goto('/');
  await waitForApp(page);
  await page.waitForTimeout(500); // let pending response bodies settle
  const lcp = await page.evaluate(() => (window as unknown as { __lcp: number }).__lcp);
  test.info().annotations.push({
    type: 'perf',
    description: `LCP ${Math.round(lcp)} ms · JS ${Math.round(jsBrotli / 1024)} KB br (${chunks.join(', ')})`,
  });
  expect(lcp, 'LCP was recorded').toBeGreaterThan(0);
  expect(lcp, `LCP ${Math.round(lcp)} ms`).toBeLessThan(2500);
  expect(jsBrotli, `JS ${Math.round(jsBrotli / 1024)} KB br`).toBeLessThan(400 * 1024);
});
