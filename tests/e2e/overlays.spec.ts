import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

/**
 * First-visit overlays used to collide: the tour card was centred in the map area while the legend
 * owns the bottom-right corner, so at 1280x720 they overlapped by 202x114 px — the tutorial sat on
 * top of the thing it was teaching. Cards are positioned by opposite corners now, and insights
 * stand down while the tour is open.
 */
const SIZES = [
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 860 },
];

type Box = { name: string; x: number; y: number; w: number; h: number };

async function visibleCards(page: import('@playwright/test').Page): Promise<Box[]> {
  return page.evaluate(() => {
    const out: { name: string; x: number; y: number; w: number; h: number }[] = [];
    for (const sel of ['.tour', '.insight', '.nowcast-card', '.legend', '.timeline', '.idu-toggle', '.idu-sub']) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push({ name: sel, x: r.x, y: r.y, w: r.width, h: r.height });
      }
    }
    return out;
  });
}

function overlaps(a: Box, b: Box) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 1 && oy > 1 ? { ox: Math.round(ox), oy: Math.round(oy) } : null;
}

for (const size of SIZES) {
  for (const firstVisit of [true, false]) {
    test(`overlays do not collide at ${size.width}x${size.height} (${
      firstVisit ? 'first visit' : 'returning'
    })`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: size });
      const page = await context.newPage();
      if (!firstVisit) {
        await page.goto('/');
        await page.evaluate(() => {
          localStorage.setItem('wtw.tourDone', '1');
          localStorage.setItem('wtw.insightsOff', '1');
        });
      }
      // ?e=1 puts the IDU toggle and its chips on screen too — the densest the map ever gets.
      await page.goto('/?e=1');
      await waitForApp(page);
      await page.waitForTimeout(600);
      const boxes = await visibleCards(page);
      const found: string[] = [];
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const o = overlaps(boxes[i]!, boxes[j]!);
          if (o) found.push(`${boxes[i]!.name} x ${boxes[j]!.name} = ${o.ox}x${o.oy}`);
        }
      expect(found, found.join('; ')).toEqual([]);
      await context.close();
    });
  }
}
