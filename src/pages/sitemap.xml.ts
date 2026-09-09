import type { APIRoute } from 'astro';
import { listCountryIso3 } from '../lib/data-server';
import { SITE_URL, canonicalPath } from '../lib/site';
import { LOCALES, localizePath } from '../i18n/ui';

/**
 * Every indexable route, checked against the filesystem by tests/unit/sitemap.test.ts — /facts and
 * five of the nine stories were missing here for weeks, which is exactly the kind of omission a
 * hand-written list produces and nobody notices.
 * Deliberately absent: /404, /embed (noindex), /sitemap.xml itself.
 */
export const STATIC = [
  '/',
  '/compare',
  '/data',
  '/facts',
  '/methodology',
  '/methodology/definitions',
  '/cite',
  '/review',
  '/insights',
  '/about',
  '/about/boundaries',
  '/stories',
  '/stories/world',
  '/stories/afghanistan',
  '/stories/bangladesh',
  '/stories/colombia',
  '/stories/hongkong',
  '/stories/rwanda',
  '/stories/syria',
  '/stories/ukraine',
  '/stories/venezuela',
  '/support',
];

export const GET: APIRoute = () => {
  const paths = [...STATIC, ...listCountryIso3().map((c) => `/country/${c}`)];
  const urls = paths.flatMap((p) =>
    LOCALES.map((l) => {
      // canonicalPath, not the bare path: the host redirects the unslashed form, and a sitemap
      // full of redirects is a sitemap Google declines to index.
      const loc = `${SITE_URL}${canonicalPath(localizePath(p, l))}`;
      const alts = LOCALES.map(
        (a) =>
          `<xhtml:link rel="alternate" hreflang="${a}" href="${SITE_URL}${canonicalPath(localizePath(p, a))}"/>`,
      ).join('');
      return `<url><loc>${loc}</loc>${alts}</url>`;
    }),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
