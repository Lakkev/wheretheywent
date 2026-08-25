/**
 * Generate per-page og:image cards (1200×630) from a local HTML template — no network,
 * every number read from public/data/v1 at generation time.
 *
 *   node scripts/dev/og-cards.mjs            # all country cards + story cards
 *   node scripts/dev/og-cards.mjs SYR VEN    # just these countries
 *   node scripts/dev/og-cards.mjs --stories  # story cards only (skip the 231 country cards)
 *
 * Output: public/og/country/{ISO3}.jpg and public/og/story/{slug}.jpg — commit them.
 * Regenerate after a data year rolls over (numbers on the cards are year-stamped).
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'public/data/v1';
const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const countries = read('countries.json').countries.filter((c) => c.in_unhcr);
const sources = read('sources.json');
const asOf = sources.unhcr_population?.data_as_of ?? '';
const argv = process.argv.slice(2);
const storiesOnly = argv.includes('--stories');
const only = argv.filter((a) => a !== '--stories');

const METRICS = ['refugees', 'asylum_seekers', 'idps', 'stateless', 'ooc', 'returned_refugees', 'returned_idps', 'oip', 'hst'];
const mi = (m) => METRICS.indexOf(m);
function unpack(packed) {
  const out = [];
  for (const x of packed) {
    if (Array.isArray(x)) {
      const [tag, n] = x;
      for (let i = 0; i < n; i++) out.push(tag === 'z' ? 0 : null);
    } else out.push(x);
  }
  return out;
}
function latest(file, view, metric) {
  const s = unpack(file[view].v[mi(metric)] ?? []);
  for (let i = file.years.length - 1; i >= 0; i--) {
    const v = s[i];
    if (v !== null && v !== undefined) return { year: file.years[i], value: v };
  }
  return null;
}
const fmt = (v) => (v === null ? '—' : v.toLocaleString('en-US'));

function cardHtml({ title, zhTitle, lines, foot }) {
  const rows = lines
    .map(
      (l) => `<div class="row"><span class="lab">${l.label}</span><span class="val">${l.value}</span></div>`,
    )
    .join('');
  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box;font-family:'Segoe UI',system-ui,'Noto Sans TC',sans-serif}
  body{width:1200px;height:630px;background:linear-gradient(135deg,#fbf7ee 0%,#f0e4cf 100%);
    padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between;color:#241c12}
  .brand{font-size:28px;font-weight:600;color:#7c4408;letter-spacing:.5px}
  h1{font-size:64px;line-height:1.1;font-weight:700;max-width:1000px}
  .zh{font-size:34px;color:#6b5c48;margin-top:10px;font-weight:500}
  .rows{display:flex;flex-direction:column;gap:14px;margin-top:8px}
  .row{display:flex;justify-content:space-between;max-width:820px;font-size:31px}
  .lab{color:#6b5c48}.val{font-weight:700;font-variant-numeric:tabular-nums}
  .foot{font-size:22px;color:#7a6a55;display:flex;justify-content:space-between}
  .bar{position:fixed;left:0;top:0;width:100%;height:10px;
    background:linear-gradient(90deg,#fee391,#fe9929,#cc4c02,#662506)}
  </style><div class="bar"></div>
  <div><div class="brand">WHERE THEY WENT · 他們去了哪裡</div>
  <h1>${title}</h1>${zhTitle ? `<div class="zh">${zhTitle}</div>` : ''}</div>
  <div class="rows">${rows}</div>
  <div class="foot"><span>${foot}</span><span>wheretheywent.lakkev.com</span></div>`;
}

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

// country cards
mkdirSync('public/og/country', { recursive: true });
let done = 0;
for (const c of countries) {
  if (storiesOnly) break;
  if (only.length && !only.includes(c.iso3)) continue;
  let file;
  try {
    file = read(`country/${c.iso3}.json`);
  } catch {
    continue;
  }
  const hosted = latest(file, 'asylum', 'refugees');
  const origin = latest(file, 'origin', 'refugees');
  const idps = latest(file, 'asylum', 'idps');
  const lines = [];
  if (hosted) lines.push({ label: `Refugees hosted (${hosted.year})`, value: fmt(hosted.value) });
  if (origin) lines.push({ label: `Refugees originating (${origin.year})`, value: fmt(origin.value) });
  if (idps) lines.push({ label: `Internally displaced (${idps.year})`, value: fmt(idps.value) });
  if (!lines.length) lines.push({ label: 'Forced displacement statistics', value: `1951–${file.years[file.years.length - 1]}` });
  await page.setContent(
    cardHtml({
      title: c.display_name,
      zhTitle: c.display_name_zh ?? '',
      lines,
      foot: `Source: UNHCR · data as of ${asOf}`,
    }),
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: `public/og/country/${c.iso3}.jpg`, type: 'jpeg', quality: 78 });
  done++;
}
console.log(`country cards: ${done}`);

// story cards
if (!only.length) {
  mkdirSync('public/og/story', { recursive: true });
  const stories = [
    { slug: 'world', title: 'Seventy-five years of counting', zh: '七十五年的計數' },
    { slug: 'syria', title: 'Syria: fourteen years displaced', zh: '敘利亞：十四年的流離' },
    { slug: 'venezuela', title: 'Venezuela: how a new category was born', zh: '委內瑞拉：一個新類別的誕生' },
    { slug: 'bangladesh', title: 'Bangladesh: within a single year', zh: '孟加拉：一年之間' },
    { slug: 'afghanistan', title: 'Afghanistan: forty-six years, and counting', zh: '阿富汗：四十六年，尚未結束' },
    { slug: 'ukraine', title: 'Ukraine: a record of speed', zh: '烏克蘭：速度的紀錄' },
    { slug: 'hongkong', title: 'Hong Kong and Macau: the per-capita record', zh: '香港與澳門：史上人均之最' },
    { slug: 'rwanda', title: 'Rwanda: within weeks', zh: '盧安達：數週之內' },
    { slug: 'colombia', title: 'Colombia: the largest number never crossed a border', zh: '哥倫比亞：沒有跨過國界的最大數字' },
  ];
  for (const s of stories) {
    await page.setContent(
      cardHtml({
        title: s.title,
        zhTitle: s.zh,
        lines: [{ label: 'A story told in checkable numbers', value: '' }],
        foot: `Source: UNHCR · data as of ${asOf}`,
      }),
      { waitUntil: 'load' },
    );
    await page.screenshot({ path: `public/og/story/${s.slug}.jpg`, type: 'jpeg', quality: 78 });
  }
  console.log(`story cards: ${stories.length}`);
}
await b.close();
