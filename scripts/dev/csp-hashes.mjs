/**
 * postbuild: hash-based CSP for inline scripts (F8 backlog).
 *
 * public/_headers keeps the placeholder __SCRIPT_HASHES__ inside every Content-Security-Policy
 * line; this script scans dist/**.html for inline executable scripts, computes their sha256
 * hashes, and rewrites dist/_headers with the real 'sha256-…' list. 'unsafe-inline' for
 * script-src is GONE — any injected inline script is refused by the browser.
 *
 * Guard: the distinct-script count is expected to stay tiny (Astro island bootstrappers +
 * two of our own snippets). If it explodes, that is a build smell — fail loudly.
 *
 * NB: style-src keeps 'unsafe-inline' deliberately: Svelte writes style attributes for
 * dynamic values (legend swatches, tooltip positions), and CSP has no workable hash story
 * for attributes set at runtime. Script injection is the threat model that matters.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const MAX_DISTINCT = 10;
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (e.endsWith('.html')) files.push(p);
  }
})('dist');

const hashes = new Set();
const re = /<script(?![^>]*\ssrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g;
for (const f of files) {
  const html = readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(html))) {
    hashes.add('sha256-' + createHash('sha256').update(m[1]).digest('base64'));
  }
}
if (hashes.size === 0) throw new Error('csp-hashes: found no inline scripts — scan is broken?');
if (hashes.size > MAX_DISTINCT)
  throw new Error(
    `csp-hashes: ${hashes.size} distinct inline scripts (max ${MAX_DISTINCT}) — investigate before widening the CSP`,
  );

const list = [...hashes]
  .sort()
  .map((h) => `'${h}'`)
  .join(' ');
const headersPath = 'dist/_headers';
const src = readFileSync(headersPath, 'utf8');
if (!src.includes('__SCRIPT_HASHES__'))
  throw new Error('csp-hashes: __SCRIPT_HASHES__ placeholder missing from _headers');
writeFileSync(headersPath, src.replaceAll('__SCRIPT_HASHES__', list));
console.log(`csp-hashes: ${hashes.size} inline script hashes written to dist/_headers`);
