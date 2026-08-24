import { test, expect } from '@playwright/test';
import { waitForApp, waitForMap } from './helpers';

test('no WebGL2 → table mode, and the maplibre chunk is never downloaded', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error — override for test
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return (orig as (this: HTMLCanvasElement, t: string, ...r: unknown[]) => unknown).call(
        this,
        type,
        ...rest,
      );
    };
  });
  await page.goto('/?y=2024');
  await waitForApp(page);
  await expect(page.locator('.nowebgl')).toBeVisible();
  await expect(page.locator('.nowebgl table tbody tr').first()).toBeVisible();
  const rows = await page.locator('.nowebgl table tbody tr').count();
  expect(rows).toBeGreaterThan(150);
  expect(requested.some((u) => /maplibre[^ ]*[.]js$/.test(u))).toBe(false); // (its 8 KB CSS is page-level; the 200 KB JS chunk must not load)
  // the table is the full equivalent: the #1 row matches the rank list
  const first = await page.locator('.nowebgl table tbody tr').first().textContent();
  const top1 = await page.locator('.ranklist li:first-child .name').textContent();
  expect(first).toContain(top1!.trim());
});

test('basemap unavailable → choropleth still renders, notice shown', async ({ page }) => {
  await page.route('**/tiles.openfreemap.org/**', (r) => r.abort());
  await page.goto('/');
  await waitForApp(page);
  await waitForMap(page);
  await expect(page.locator('.nobasemap')).toBeVisible();
  const feats = await page.evaluate(
    () =>
      (
        window as unknown as {
          __wtwMap: { queryRenderedFeatures: (a?: unknown, o?: unknown) => unknown[] };
        }
      ).__wtwMap.queryRenderedFeatures(undefined, { layers: ['wtw-fill'] }).length,
  );
  expect(feats).toBeGreaterThan(100);
});

test('keyboard: / focuses search, T toggles table, arrows change year, Esc = presentation mode', async ({
  page,
}) => {
  await page.goto('/');
  await waitForApp(page);
  await page.keyboard.press('/');
  await expect(page.locator('.rail input[type=search]')).toBeFocused();
  await page.keyboard.press('Escape'); // blur input
  await page.keyboard.press('t');
  await expect(page.locator('.table-drawer')).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.locator('.table-drawer')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.timeline .year')).toHaveText('2024');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.timeline .year')).toHaveText('2025');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveClass(/presentation/);
  await expect(page.locator('.overlays .rail')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/presentation/);
});

test('year scrubbing is purely client-side (no data requests while dragging)', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await waitForMap(page);
  await page.waitForTimeout(4000); // let idle prefetch of history finish
  const reqs: string[] = [];
  page.on('request', (r) => reqs.push(r.url()));
  for (const y of ['2020', '2010', '1995', '1975', '2005']) {
    await page.locator('.timeline input[type=range]').fill(y);
    await expect(page.locator('.timeline .year')).toHaveText(y);
  }
  expect(reqs.filter((u) => u.includes('/data/v1/'))).toEqual([]);
});
