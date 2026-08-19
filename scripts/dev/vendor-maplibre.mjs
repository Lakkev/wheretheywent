// Copies MapLibre's worker modules into public/ so the browser can load them.
// MapLibre GL JS v6 resolves its worker as `new URL('./maplibre-gl-worker.mjs', import.meta.url)`,
// which breaks once the main module is bundled under /_astro/<hash>.js. We therefore serve the
// worker (+ the shared chunk it imports) from a stable, versioned public path and point
// `setWorkerUrl()` at it in src/components/map/MapCanvas.svelte. Runs on predev/prebuild.
import { mkdirSync, copyFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync('node_modules/maplibre-gl/package.json', 'utf8'));
const src = 'node_modules/maplibre-gl/dist';
const root = 'public/vendor/maplibre-gl';
const dst = join(root, pkg.version);
if (existsSync(root)) rmSync(root, { recursive: true, force: true }); // drop stale versions
mkdirSync(dst, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(join(src, f), join(dst, f));
console.log(`vendored maplibre-gl ${pkg.version} worker → ${dst}`);
