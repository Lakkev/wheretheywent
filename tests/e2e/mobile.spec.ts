import { test, expect, type Page } from '@playwright/test';

/** Mobile-viewport guards (375×812): the desktop suite never exercises the narrow layout.
 *  Three invariants: the map app works, panels open, and NO page scrolls horizontally. */
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(1);
}

test('map page: loads narrow, timeline visible, no horizontal scroll', async ({ page }) => {
  await page.goto('/zh-Hant/');
  await page.waitForSelector('#map-skeleton', { state: 'detached', timeout: 30_000 });
  await expect(page.locator('.timeline')).toBeVisible();
  await expect(page.locator('.topbar, header').first()).toBeVisible();
  await noHorizontalScroll(page);
});

test('map page: selecting a country via URL opens the mobile detail sheet', async ({ page }) => {
  await page.goto('/zh-Hant/?c=SYR');
  await page.waitForSelector('#map-skeleton', { state: 'detached', timeout: 30_000 });
  await expect(page.locator('.detail')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.detail')).toContainText('敘利亞');
  await noHorizontalScroll(page);
});

test('map page: hamburger menu opens VISIBLY on mobile (topbar scroller must not clip it)', async ({
  page,
}) => {
  await page.goto('/zh-Hant/');
  await page.waitForSelector('#map-skeleton', { state: 'detached', timeout: 30_000 });
  await page.locator('.menu > button').click();
  const panel = page.locator('.menu-panel');
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  const vp = page.viewportSize()!;
  // actually on screen, not clipped inside the 48px topbar
  expect(box.height).toBeGreaterThan(100);
  expect(box.y).toBeGreaterThan(30);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  await expect(page.locator('.menu-nav a').first()).toBeVisible();
});

test('map page: attribution bar does not cover the timeline controls', async ({ page }) => {
  await page.goto('/zh-Hant/');
  await page.waitForSelector('#map-skeleton', { state: 'detached', timeout: 30_000 });
  const attr = (await page.locator('.attribution').boundingBox())!;
  const tl = (await page.locator('.timeline').boundingBox())!;
  // attribution must end at or above the timeline's top edge
  expect(attr.y + attr.height).toBeLessThanOrEqual(tl.y + 1);
});

for (const path of [
  '/zh-Hant/country/SYR/',
  '/zh-Hant/insights/',
  '/zh-Hant/facts/',
  '/zh-Hant/stories/afghanistan/',
  '/zh-Hant/data/',
  '/zh-Hant/methodology/',
  '/zh-Hant/cite/',
]) {
  test(`no horizontal scroll: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('load');
    await page.waitForTimeout(600);
    await noHorizontalScroll(page);
  });
}
