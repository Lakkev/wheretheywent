/**
 * Weekly social card: one record from the record library, rendered as a 1080×1440 (3:4)
 * earth-palette card + a ready-to-paste caption. Rotation is deterministic by ISO week,
 * so "this week's card" is reproducible.
 *
 *   node scripts/dev/weekly-card.mjs          # this week's card → private/weekly/
 *   node scripts/dev/weekly-card.mjs 7        # force item #7 of the rotation
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ins = JSON.parse(readFileSync('public/data/v1/insights.json', 'utf8'));
const countries = JSON.parse(readFileSync('public/data/v1/countries.json', 'utf8')).countries;
const nameZh = (iso3) => countries.find((c) => c.iso3 === iso3)?.display_name_zh ?? iso3;
const fmt = (v) => Math.abs(v).toLocaleString('en-US');
const R = ins.records;

/** The rotation: one item per week, cycling. Each = {kick, big, sub, link} */
const ITEMS = [];
for (const [i, r] of R.host_jumps.entries())
  ITEMS.push({
    kick: `史上第 ${i + 1} 大單年收容增幅`,
    big: `${nameZh(r.iso3)}<br>+${fmt(r.delta)}`,
    sub: `${r.year} 年,一年之內。<br>每一個數字,都是一個抵達的人。`,
    link: `wheretheywent.lakkev.com/?y=${r.year}&c=${r.iso3}`,
  });
for (const [i, r] of R.per1k_peaks.slice(0, 5).entries())
  ITEMS.push({
    kick: `史上人均收容第 ${i + 1} 名`,
    big: `${nameZh(r.iso3)}<br>每千人 ${r.rate} 人`,
    sub: `${r.year} 年。相對自己的人口,<br>承擔最重的往往不是大國。`,
    link: `wheretheywent.lakkev.com/?y=${r.year}&c=${r.iso3}&n=per1k`,
  });
for (const [i, r] of R.host_drops.slice(0, 5).entries())
  ITEMS.push({
    kick: `史上第 ${i + 1} 大單年下降`,
    big: `${nameZh(r.iso3)}<br>−${fmt(r.delta)}`,
    sub: `${r.year} 年。下降不必然是回家——<br>也可能是入籍、改口徑,或遣返。`,
    link: `wheretheywent.lakkev.com/?y=${r.year}&c=${r.iso3}`,
  });

const week = (() => {
  const d = new Date();
  const j1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - j1) / 86400000 + j1.getDay() + 1) / 7);
})();
const idx = process.argv[2] !== undefined ? Number(process.argv[2]) % ITEMS.length : week % ITEMS.length;
const item = ITEMS[idx];

const html = `<!doctype html><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box;font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif}
body{width:1080px;height:1440px;background:#faf7f1;color:#241c12;display:flex;flex-direction:column}
.bar{height:18px;background:linear-gradient(90deg,#fee391,#fe9929,#cc4c02,#662506)}
.pad{flex:1;display:flex;flex-direction:column;justify-content:center;padding:80px 90px}
.kick{font-size:44px;font-weight:700;color:#7c4408;letter-spacing:.1em;margin-bottom:40px}
h1{font-size:120px;line-height:1.25;font-weight:900;color:#cc4c02}
.sub{font-size:52px;line-height:1.65;color:#55483a;margin-top:52px;font-weight:500}
.verify{margin-top:56px;font-size:38px;color:#7c4408;font-weight:700}
.foot{padding:44px 90px;display:flex;justify-content:space-between;background:#241c12;color:#f3ede2}
.foot .site{font-size:40px;font-weight:700}.foot .n{font-size:36px;color:#c9b99f}
</style><div class="bar"></div><div class="pad">
<div class="kick">${item.kick}</div><h1>${item.big}</h1>
<div class="sub">${item.sub}</div>
<div class="verify">親自驗證 → ${item.link}</div></div>
<div class="foot"><span class="site">他們去了哪裡 wheretheywent.lakkev.com</span><span class="n">每週一數</span></div>`;

mkdirSync('private/weekly', { recursive: true });
const out = `private/weekly/week-${String(idx).padStart(2, '0')}.jpg`;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1080, height: 1440 } });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
await b.close();

const caption = `【每週一數】${item.kick}:${item.big.replace('<br>', ' ')}。
${item.sub.replace(/<br>/g, '')}
數字可自行驗證(附出處與資料截至日期):${item.link}
#難民 #數據 #他們去了哪裡`;
writeFileSync(out.replace('.jpg', '-caption.txt'), caption);
console.log('card:', out, '| rotation', idx + 1, 'of', ITEMS.length);
console.log(caption);
