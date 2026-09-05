// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { loadEnv } from 'vite';

// Astro does NOT load .env into process.env for this config file; read it explicitly so the
// `site` used for canonical/sitemap always matches src/lib/site.ts (PUBLIC_SITE_URL).
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_');
const site =
  process.env.PUBLIC_SITE_URL || env.PUBLIC_SITE_URL || 'https://wheretheywent.lakkev.com';

// https://astro.build/config
export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [svelte()],
  i18n: {
    defaultLocale: 'en',
    // Must stay identical to LOCALES in src/i18n/ui.ts — asserted by tests/unit/i18n.test.ts.
    // It listed only two while the site shipped seven, so Astro's own i18n helpers disagreed
    // with every page the site actually builds.
    locales: ['en', 'zh-Hant', 'zh-Hans', 'fr', 'es', 'ja', 'ko'],
    routing: { prefixDefaultLocale: false },
  },
  build: {
    // keep data files addressable by stable paths; assets hashed by Vite
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      // maplibre is dynamically imported; keep it in its own chunk (WebGL2 gate, §8.4)
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('maplibre-gl')) return 'maplibre';
            if (id.includes('@observablehq/plot') || id.includes('/d3-')) return 'plot';
          },
        },
      },
    },
  },
});
