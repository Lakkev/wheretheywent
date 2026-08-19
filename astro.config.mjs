// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

const site = process.env.PUBLIC_SITE_URL || 'https://wheretheywent.pages.dev';

// https://astro.build/config
export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [svelte()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-Hant'],
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
