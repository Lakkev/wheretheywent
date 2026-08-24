import type { APIRoute } from 'astro';
import { listCountryIso3 } from '../lib/data-server';
import { SITE_URL } from '../lib/site';
import { LOCALES, localizePath } from '../i18n/ui';

const STATIC = [
  '/',
  '/compare',
  '/data',
  '/methodology',
  '/about',
  '/about/boundaries',
  '/stories',
  '/stories/world',
  '/stories/syria',
  '/stories/venezuela',
  '/stories/bangladesh',
  '/support',
];

export const GET: APIRoute = () => {
  const paths = [...STATIC, ...listCountryIso3().map((c) => `/country/${c}`)];
  const urls = paths.flatMap((p) =>
    LOCALES.map((l) => {
      const loc = `${SITE_URL}${localizePath(p, l)}`;
      const alts = LOCALES.map(
        (a) =>
          `<xhtml:link rel="alternate" hreflang="${a}" href="${SITE_URL}${localizePath(p, a)}"/>`,
      ).join('');
      return `<url><loc>${loc}</loc>${alts}</url>`;
    }),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
