import { test, expect } from '@playwright/test';
import { waitForApp, waitForMap, trackPageErrors } from './helpers';

/** Phase 2: flow arcs — f=1 with a selected country draws the top-partner arc layer. */
test('flow arcs render for a selected country (f=1)', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto('/?c=SYR&v=origin&y=2024&f=1');
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
        !!m.getLayer('wtw-flows') &&
        m.queryRenderedFeatures(undefined, { layers: ['wtw-flows'] }).length > 0
      );
    },
    { timeout: 15_000 },
  );
  // the overview panel explains the layer
  await expect(page.locator('.detail')).toContainText('Flow arcs');
  // unchecking the toggle removes the layer
  await page.locator('.detail input[type=checkbox]').first().uncheck();
  await page.waitForFunction(
    () =>
      !(
        window as unknown as { __wtwMap?: { getLayer: (id: string) => unknown } }
      ).__wtwMap?.getLayer('wtw-flows'),
    { timeout: 5_000 },
  );
  expect(errors).toEqual([]);
});
