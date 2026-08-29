// Measure the discrepancy distribution between bilateral flows/{year}.json sums and the stock
// marginals — the evidence base for invariant #16's tolerance (docs/data-verification.md).
// Re-run this (and record the result there) before ever widening THRESHOLDS.bilateral*Tolerance.
// Usage: node scripts/dev/measure-bilateral.mjs public/data/v1
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const IN = process.argv[2];
const read = (p) => JSON.parse(readFileSync(join(IN, p), 'utf8'));

function unpack(packed) {
  const out = [];
  for (const c of packed) {
    if (Array.isArray(c)) {
      const fill = c[0] === 'z' ? 0 : null;
      for (let k = 0; k < c[1]; k++) out.push(fill);
    } else out.push(c);
  }
  return out;
}

const manifest = read('manifest.json');
const stocks = manifest.stock_files.map(read);
const METRICS = ['refugees', 'asylum_seekers']; // flows columns 2 and 3
const MI = { refugees: 0, asylum_seekers: 1 }; // METRIC_IDS indices

// marginal[view][iso3][year][metric] -> number|null
function marginals(view) {
  const m = new Map();
  for (const s of stocks) {
    for (const [k, e] of Object.entries(s[view])) {
      const byYear = m.get(k) ?? new Map();
      for (const metric of METRICS) {
        const series = unpack(e.v[MI[metric]]);
        series.forEach((v, yi) => {
          const y = s.years[yi];
          const cur = byYear.get(y) ?? {};
          cur[metric] = v;
          byYear.set(y, cur);
        });
      }
      m.set(k, byYear);
    }
  }
  return m;
}
const margAsylum = marginals('asylum');
const margOrigin = marginals('origin');

const flowFiles = readdirSync(join(IN, 'flows')).filter((f) => f.endsWith('.json'));
const results = []; // {year, metric, side, iso3, bsum, marginal, absDiff, relDiff}

for (const f of flowFiles) {
  const { year, rows } = read(join('flows', f));
  for (const metric of METRICS) {
    const col = metric === 'refugees' ? 2 : 3;
    const byO = new Map();
    const byA = new Map();
    for (const r of rows) {
      const v = r[col];
      if (v === null) continue;
      byO.set(r[0], (byO.get(r[0]) ?? 0) + v);
      byA.set(r[1], (byA.get(r[1]) ?? 0) + v);
    }
    for (const [side, sums, marg] of [
      ['origin', byO, margOrigin],
      ['asylum', byA, margAsylum],
    ]) {
      // union of keys: countries in bilateral, and countries with a non-null marginal
      const keys = new Set(sums.keys());
      for (const [k, byYear] of marg) {
        const mv = byYear.get(year)?.[metric];
        if (mv !== null && mv !== undefined && mv > 0) keys.add(k);
      }
      for (const k of keys) {
        const bsum = sums.get(k) ?? 0;
        const mv = marg.get(k)?.get(year)?.[metric] ?? null;
        const m = mv ?? 0;
        const absDiff = Math.abs(bsum - m);
        const denom = Math.max(bsum, m);
        results.push({
          year, metric, side, iso3: k, bsum, marginal: mv,
          absDiff, relDiff: denom > 0 ? absDiff / denom : 0,
        });
      }
    }
  }
}

// ---- report ----
const n = results.length;
const exact = results.filter((r) => r.absDiff === 0).length;
console.log(`cells compared: ${n}; exact matches: ${exact} (${((exact / n) * 100).toFixed(1)}%)`);

const nonzero = results.filter((r) => r.absDiff > 0).sort((a, b) => a.absDiff - b.absDiff);
console.log(`non-exact cells: ${nonzero.length}`);
const q = (p) => nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))];
for (const p of [0.5, 0.9, 0.95, 0.99, 1.0]) {
  const r = q(p === 1 ? 0.999999 : p);
  console.log(`  absDiff p${p * 100}: ${r?.absDiff}`);
}
const byRel = [...nonzero].sort((a, b) => a.relDiff - b.relDiff);
const qr = (p) => byRel[Math.min(byRel.length - 1, Math.floor(p * byRel.length))];
for (const p of [0.5, 0.9, 0.95, 0.99, 1.0]) {
  const r = qr(p === 1 ? 0.999999 : p);
  console.log(`  relDiff p${p * 100}: ${(r?.relDiff * 100).toFixed(3)}% (abs ${r?.absDiff}, ${r?.side}/${r?.iso3}/${r?.year}/${r?.metric})`);
}

// marginal null but bilateral sum > 0?
const nullMarg = results.filter((r) => r.marginal === null && r.bsum > 0);
console.log(`\ncells with null marginal but bilateral sum > 0: ${nullMarg.length}`);
for (const r of nullMarg.slice(0, 10)) console.log(`  ${r.side}/${r.iso3}/${r.year}/${r.metric}: bsum=${r.bsum}`);

console.log('\nworst 25 by absDiff:');
for (const r of [...nonzero].reverse().slice(0, 25))
  console.log(
    `  ${r.side.padEnd(6)} ${r.iso3} ${r.year} ${r.metric.padEnd(14)} bilateral=${String(r.bsum).padStart(9)} marginal=${String(r.marginal).padStart(9)} diff=${String(r.absDiff).padStart(8)} (${(r.relDiff * 100).toFixed(2)}%)`,
  );

// distribution of relDiff buckets (share of ALL compared cells)
console.log('\nrelDiff buckets (all cells):');
for (const [lo, hi] of [[0, 0], [0, 0.0001], [0.0001, 0.001], [0.001, 0.01], [0.01, 0.05], [0.05, 0.2], [0.2, 1.01]]) {
  const c = results.filter((r) => (lo === 0 && hi === 0 ? r.absDiff === 0 : r.relDiff > lo && r.relDiff <= hi)).length;
  console.log(`  ${lo === 0 && hi === 0 ? 'exact' : `(${lo * 100}%, ${hi * 100}%]`}: ${c}`);
}

// absDiff buckets
console.log('\nabsDiff buckets (non-exact):');
for (const [lo, hi] of [[0, 5], [5, 10], [10, 50], [50, 100], [100, 1000], [1000, 10000], [10000, Infinity]]) {
  const c = nonzero.filter((r) => r.absDiff > lo && r.absDiff <= hi).length;
  console.log(`  (${lo}, ${hi}]: ${c}`);
}

// per-year totals check: sum of all bilateral vs global total
console.log('\nper-year: max relDiff and count>1% by year/metric/side');
const byYm = new Map();
for (const r of results) {
  const k = `${r.year}|${r.metric}|${r.side}`;
  const cur = byYm.get(k) ?? { max: 0, over1: 0, overAbs100: 0 };
  cur.max = Math.max(cur.max, r.relDiff);
  if (r.relDiff > 0.01 && r.absDiff > 100) cur.overAbs100++;
  if (r.relDiff > 0.01) cur.over1++;
  byYm.set(k, cur);
}
for (const [k, v] of [...byYm].sort())
  console.log(`  ${k}: maxRel=${(v.max * 100).toFixed(2)}% over1%=${v.over1} over1%&abs>100=${v.overAbs100}`);
