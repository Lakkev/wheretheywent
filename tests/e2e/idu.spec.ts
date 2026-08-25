import { test, expect } from '@playwright/test';
import { waitForApp, waitForMap, trackPageErrors } from './helpers';

/** Regression: the IDU layer (e=1) must actually add wtw-idu and render event dots.
 *  It was once silently dropped for months — circle-sort-key sat in `paint`, and MapLibre
 *  rejects an invalid layer via an error EVENT, not a throw. Skips when live data is absent
 *  (live/* is untracked; fresh CI checkouts have none until the ETL runs). */
test('IDU event layer renders dots when toggled (e=1)', async ({ page, request }) => {
  const live = await request.get('/data/v1/live/idu-latest.json');
  test.skip(!live.ok(), 'no live IDU snapshot in this checkout');

  const errors = trackPageErrors(page);
  await page.goto('/?e=1');
  await waitForApp(page);
  await waitForMap(page);
  await page.waitForFunction(
    () => {
      const m = (
        window as unknown as {
          __wtwMap?: {
            getLayer: (id: string) => unknown;
            queryRenderedFeatures: (a?: unknown, o?: unknown) => unknown[];
          };
        }
      ).__wtwMap;
      return (
        !!m &&
        !!m.getLayer('wtw-idu') &&
        m.queryRenderedFeatures(undefined, { layers: ['wtw-idu'] }).length > 0
      );
    },
    { timeout: 15_000 },
  );
  // the event timeline dialog lists the chronology behind the dots
  await page.locator('button.idu-timeline-btn').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.locator('tbody tr').count()).toBeGreaterThan(10);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // toggling off removes the layer again
  await page.locator('button.idu-toggle').click();
  await page.waitForFunction(
    () =>
      !(
        window as unknown as { __wtwMap?: { getLayer: (id: string) => unknown } }
      ).__wtwMap?.getLayer('wtw-idu'),
    { timeout: 10_000 },
  );
  expect(errors).toEqual([]);
});
