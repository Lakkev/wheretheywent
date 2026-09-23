import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STATIC } from '../../src/pages/sitemap.xml';
import { canonicalPath } from '../../src/lib/site';

/**
 * Two failures shipped together and both were invisible without a test:
 *  - the sitemap listed unslashed paths while the host 308-redirects to the slashed form, so every
 *    URL submitted to Google was a redirect ("Page with redirect", Search Console 2026-09-07);
 *  - /facts and five of the nine stories were never in the list at all.
 */
const PAGES = 'src/pages';
// noindex or not a page: the 404, the embeddable map, the sitemap itself, and dynamic country
// routes (covered separately from the published country list).
const EXCLUDED = new Set(['/404', '/embed', '/sitemap.xml']);
const LOCALE_DIRS = new Set(['zh-Hant', 'zh-Hans', 'fr', 'es', 'ja', 'ko']);

function routesOnDisk(dir = PAGES, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (LOCALE_DIRS.has(name)) continue; // locale variants are generated from the same paths
      if (name === 'country') continue; // dynamic route
      out.push(...routesOnDisk(full, `${prefix}/${name}`));
      continue;
    }
    const m = name.match(/^(.+)\.astro$/);
    if (!m) continue;
    const base = m[1]!;
    out.push(base === 'index' ? `${prefix}/` : `${prefix}/${base}`);
  }
  return out;
}

describe('sitemap route list', () => {
  // Compare in canonical form: "about/index.astro" is the same route as the list's "/about".
  const onDisk = new Set(routesOnDisk().map((r) => canonicalPath(r === '//' ? '/' : r)));
  const listed = new Set(STATIC.map(canonicalPath));
  const excluded = new Set([...EXCLUDED].map(canonicalPath));

  it('lists every indexable page that exists', () => {
    const missing = [...onDisk].filter((r) => !excluded.has(r) && !listed.has(r));
    expect(missing, `not in sitemap: ${missing.join(', ')}`).toEqual([]);
  });

  it('lists nothing that does not exist', () => {
    const stale = [...listed].filter((r) => !onDisk.has(r));
    expect(stale, `in sitemap but no such page: ${stale.join(', ')}`).toEqual([]);
  });

  it('emits canonical, non-redirecting paths', () => {
    for (const p of STATIC) expect(canonicalPath(p).endsWith('/')).toBe(true);
    expect(canonicalPath('/facts')).toBe('/facts/');
    expect(canonicalPath('/facts/')).toBe('/facts/');
    expect(canonicalPath('/')).toBe('/');
    expect(canonicalPath('/zh-Hant/stories/rwanda')).toBe('/zh-Hant/stories/rwanda/');
  });
});

/**
 * The sitemap fix alone was not enough: localizePath built every internal link in unslashed form,
 * so Google kept discovering redirecting URLs from our own pages (Search Console "Page with
 * redirect" rose from 29 to 54 after dee00a0). Two components also hand-wrote hrefs, one of them
 * dropping the reader's language. No internal link may be written outside localizePath.
 */
import { readFileSync } from 'node:fs';
describe('internal links', () => {
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const n of readdirSync(dir)) {
      const f = join(dir, n);
      if (statSync(f).isDirectory()) out.push(...sources(f));
      else if (/\.(svelte|astro)$/.test(n)) out.push(f);
    }
    return out;
  }
  it('are never hand-written root-relative page paths', () => {
    const bad: string[] = [];
    for (const f of sources('src')) {
      const text = readFileSync(f, 'utf8');
      // href="/page" or href={`/page...`} — static assets and data files are exempt
      const re = /href=(?:"|\{\s*`)(\/[a-z][^"`]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const target = m[1]!;
        // the data directory and static assets, not the /data page itself
        if (/^\/(data\/v1\/|docs\/|_astro\/|og\/|favicon)/.test(target)) continue;
        if (/\.(csv|json|xml|pdf|png|svg|ico|txt)$/.test(target)) continue;
        bad.push(`${f}: ${target}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
