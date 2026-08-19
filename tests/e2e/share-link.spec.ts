import { test, expect } from '@playwright/test';
import { waitForApp, waitForMap, mapState, uiSnapshot } from './helpers';

/**
 * ★ The permalink must reproduce the view byte-for-byte (spec §13.4 share-link):
 * a sequence of interactions → copy URL → load it in a FRESH context (empty cache) → identical UI.
 */
test('share link reproduces the view in a fresh context', async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const page = await ctx1.newPage();
  await page.goto('/');
  await waitForApp(page);
  await waitForMap(page);

  // interactions: origin view, IDPs, year 2016, select Syria via search, open table, collapse rail
  await page.getByRole('button', { name: 'Origin', exact: true }).click();
  await page.locator('#metric-select').selectOption('idps');
  await page.locator('.timeline input[type=range]').fill('2016');
  await page.locator('.rail input[type=search]').fill('syria');
  await page.locator('.search-results li').first().click();
  await page.keyboard.press('t');
  await page.waitForSelector('.table-drawer');
  // zoom the map programmatically (user gesture equivalent) and wait for URL debounce
  await page.evaluate(() => (window as unknown as { __wtwMap: { jumpTo: (o: unknown) => void } }).__wtwMap.jumpTo({ center: [38.5, 35], zoom: 4.25 }));
  await page.waitForTimeout(700);
  const url = page.url();
  expect(url).toContain('y=2016');
  expect(url).toContain('m=idps');
  expect(url).toContain('v=origin');
  expect(url).toContain('c=SYR');
  expect(url).toContain('t=1');
  expect(url).toMatch(/map=4\.25\/35\/38\.5/);
  const snap1 = await uiSnapshot(page);
  const map1 = await mapState(page);
  await ctx1.close();

  // fresh context: no cache, no storage
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(url);
  await waitForApp(page2);
  await waitForMap(page2);
  await page2.waitForSelector('.table-drawer');
  await page2.waitForTimeout(500);
  const snap2 = await uiSnapshot(page2);
  const map2 = await mapState(page2);
  expect(snap2.year).toBe(snap1.year);
  expect(snap2.legendTitle).toBe(snap1.legendTitle);
  expect(snap2.legendTicks).toBe(snap1.legendTicks);
  expect(snap2.top1).toBe(snap1.top1);
  expect(snap2.detail).toBe(snap1.detail);
  expect(snap2.table).toBe(true);
  expect(snap2.url).toBe(snap1.url);
  expect(Math.abs(map2!.zoom - map1!.zoom)).toBeLessThan(0.01);
  expect(Math.abs(map2!.lng - map1!.lng)).toBeLessThan(0.01);
  expect(Math.abs(map2!.lat - map1!.lat)).toBeLessThan(0.01);
  // Syria IDPs 2016 golden number visible in the detail panel
  expect(await page2.locator('.detail .kpi .value').first().textContent()).toBe('6,325,978');
  await ctx2.close();
});

test('invalid params fall back with a toast, never crash', async ({ page }) => {
  await page.goto('/?y=1800&m=bogus&c=ZZZ&map=nope');
  await waitForApp(page);
  await expect(page.locator('.toast').first()).toContainText('invalid');
  const s = await uiSnapshot(page);
  expect(s.year).toBe('2025');
  expect(s.legendTitle).toContain('Refugees');
});

test('browser back/forward restores state (popstate)', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.locator('#metric-select').selectOption('asylum_seekers');
  await page.waitForURL(/m=asylum_seekers/);
  await page.getByRole('button', { name: 'Origin', exact: true }).click();
  await page.waitForURL(/v=origin/);
  await page.goBack();
  await page.waitForURL((u) => !u.search.includes('v=origin'));
  expect((await uiSnapshot(page)).legendTitle).toContain('Asylum-seekers');
  await page.goBack();
  await page.waitForURL((u) => !u.search.includes('m='));
  expect((await uiSnapshot(page)).legendTitle).toContain('Refugees');
});
