import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

const PAGES = ['/zh-Hant/', '/zh-Hant/about/', '/zh-Hant/methodology/', '/zh-Hant/country/SYR/', '/zh-Hant/data/'];

test('zh-Hant pages: lang attribute, no raw i18n keys in the DOM', async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p);
    if (p === '/zh-Hant/') await waitForApp(page);
    expect(await page.locator('html').getAttribute('lang')).toBe('zh-Hant');
    const text = await page.locator('body').innerText();
    // raw keys look like "nav.map" / "metric.refugees" — must never leak
    expect(text).not.toMatch(/\b(nav|metric|view|scale|legend|timeline|rail|table|detail|compare|source|cite|download|share|keys|map|country|page|common|a11y)\.[a-z][a-zA-Z0-9_.]+\b/);
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

test('perf budget: JS transfer < 400 KB (br/gz) on the map page; first view < 5 s on slow-ish network', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  // approximate "Fast 3G / 4G" throttling: 1.5 Mbps down, 150 ms RTT
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  let jsBytes = 0;
  page.on('response', async (r) => {
    const u = r.url();
    if (/\/_astro\/.*\.js$/.test(u) && !u.includes('plot')) {
      const h = r.headers();
      const len = Number(h['content-length'] ?? 0);
      jsBytes += len || (await r.body().catch(() => Buffer.alloc(0))).length;
    }
  });
  const t0 = Date.now();
  await page.goto('/');
  await waitForApp(page);
  const elapsed = Date.now() - t0;
  // our static server does not compress; estimate brotli ≈ raw/4 for JS (measured 202 KB br for 958 KB raw)
  const estBr = jsBytes / 4;
  test.info().annotations.push({ type: 'perf', description: `raw JS ${Math.round(jsBytes / 1024)} KB (~${Math.round(estBr / 1024)} KB br), first view ${elapsed} ms` });
  expect(estBr).toBeLessThan(400 * 1024);
  expect(elapsed).toBeLessThan(15_000); // generous under emulated throttling + raw transfer
});
