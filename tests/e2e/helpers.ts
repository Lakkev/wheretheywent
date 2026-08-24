import type { Page } from '@playwright/test';

/**
 * F5: collect uncaught page errors (e.g. a missing import that only explodes at runtime).
 * Attach right after creating the page; assert the returned array is empty at the end.
 */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** Wait until the map app replaced the skeleton and the first view is computed. */
export async function waitForApp(page: Page) {
  await page.waitForSelector('#map-skeleton', { state: 'detached', timeout: 30_000 });
  await page.waitForSelector('.overlays .ranklist li .val, .nowebgl table tbody tr', {
    timeout: 30_000,
  });
}

/** Wait until our choropleth source is loaded and rendered (if WebGL is available). */
export async function waitForMap(page: Page) {
  await page.waitForFunction(
    () => {
      const m = (
        window as unknown as {
          __wtwMap?: {
            isSourceLoaded: (s: string) => boolean;
            queryRenderedFeatures: (a?: unknown, o?: unknown) => unknown[];
          };
        }
      ).__wtwMap;
      return (
        !!m &&
        m.isSourceLoaded('wtw-countries') &&
        m.queryRenderedFeatures(undefined, { layers: ['wtw-fill'] }).length > 0
      );
    },
    { timeout: 30_000 },
  );
}

export async function mapState(page: Page) {
  return page.evaluate(() => {
    const m = (
      window as unknown as {
        __wtwMap?: { getCenter: () => { lng: number; lat: number }; getZoom: () => number };
      }
    ).__wtwMap;
    return m ? { lng: m.getCenter().lng, lat: m.getCenter().lat, zoom: m.getZoom() } : null;
  });
}

export async function uiSnapshot(page: Page) {
  return page.evaluate(() => {
    const ov = document.querySelector('.overlays')!;
    const txt = (s: string) =>
      ov.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    return {
      year: txt('.timeline .year'),
      legendTitle: txt('.legend .title'),
      legendTicks: txt('.legend .ticks'),
      top1: txt('.ranklist li:first-child'),
      detail: txt('.detail .title'),
      table: !!document.querySelector('.table-drawer'),
      railCollapsed: !!ov.querySelector('.rail.is-collapsed'),
      url: location.pathname + location.search,
    };
  });
}
