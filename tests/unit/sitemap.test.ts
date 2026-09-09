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
