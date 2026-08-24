/**
 * Deposit the current published data snapshot to Zenodo and mint a DOI.
 *
 *   node scripts/dev/zenodo-deposit.mjs            # create + upload + publish
 *   node scripts/dev/zenodo-deposit.mjs --dry      # create + upload, do NOT publish
 *
 * Requires ZENODO_TOKEN in .env (never committed). Publishing is PERMANENT on Zenodo.
 * Subsequent quarterly runs should use the "new version" flow off the concept DOI
 * (documented in docs/RUNBOOK.md once the first concept DOI exists).
 */
import { readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const TOKEN = env.ZENODO_TOKEN;
if (!TOKEN) throw new Error('ZENODO_TOKEN missing from .env');
const API = 'https://zenodo.org/api';
const auth = { Authorization: `Bearer ${TOKEN}` };
const dry = process.argv.includes('--dry');

const manifest = JSON.parse(readFileSync('public/data/v1/manifest.json', 'utf8'));
const sources = JSON.parse(readFileSync('public/data/v1/sources.json', 'utf8'));
const snap = manifest.snapshot_id;
const asOf = sources.unhcr_population?.data_as_of ?? '';

// bundle: the published annual data tree (live/* excluded — preliminary, replaced daily)
const tarName = `wheretheywent-data-${snap}.tar.gz`;
console.log('bundling', tarName, '…');
execSync(`tar --exclude=live -czf "${tarName}" -C public data/v1`, {
  shell: 'bash.exe',
  stdio: 'inherit',
});
const bytes = statSync(tarName).size;
console.log('bundle size:', (bytes / 1e6).toFixed(1), 'MB');

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...auth, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

const dep = await api('/deposit/depositions', { method: 'POST', body: '{}' });
console.log('deposition created:', dep.id);

// upload via the files bucket (streaming PUT)
const bucket = dep.links.bucket;
const put = await fetch(`${bucket}/${tarName}`, {
  method: 'PUT',
  headers: auth,
  body: readFileSync(tarName),
});
if (!put.ok) throw new Error(`upload → ${put.status}: ${await put.text()}`);
console.log('uploaded.');

const metadata = {
  metadata: {
    title: `Where They Went — global forced-displacement dataset (snapshot ${snap})`,
    upload_type: 'dataset',
    publication_date: new Date().toISOString().slice(0, 10),
    description:
      `<p>Complete published data tree of <a href="https://wheretheywent.lakkev.com">Where They Went</a>, ` +
      `a citable static platform republishing UNHCR Refugee Population Statistics Database, IDMC and UN WPP figures ` +
      `verbatim with content-addressed snapshots. Snapshot <code>${snap}</code>, data as of ${asOf}. ` +
      `"Not reported" values are preserved as null, never zero. Includes per-country JSON, columnar stock files, ` +
      `bilateral flow matrices (2015+), bulk CSVs with embedded provenance, metric definitions with translations ` +
      `in seven languages, and machine-readable source/licensing metadata (sources.json, datapackage.json). ` +
      `Methodology: <a href="https://wheretheywent.lakkev.com/methodology">wheretheywent.lakkev.com/methodology</a>.</p>` +
      `<p>Component licences: UNHCR CC BY 4.0 · IDMC CC BY-IGO · UN WPP CC BY 3.0 IGO · Natural Earth public domain.</p>`,
    creators: [{ name: 'Lakkev' }],
    license: 'cc-by-4.0',
    keywords: [
      'refugees',
      'forced displacement',
      'asylum',
      'internally displaced persons',
      'statelessness',
      'UNHCR',
      'IDMC',
    ],
    version: snap,
    related_identifiers: [
      { relation: 'isSupplementTo', identifier: 'https://wheretheywent.lakkev.com' },
      { relation: 'isDerivedFrom', identifier: 'https://www.unhcr.org/refugee-statistics/' },
      { relation: 'isDerivedFrom', identifier: 'https://www.internal-displacement.org/database/' },
    ],
  },
};
await api(`/deposit/depositions/${dep.id}`, { method: 'PUT', body: JSON.stringify(metadata) });
console.log('metadata set.');

if (dry) {
  console.log('DRY RUN — not published. Draft:', dep.links.html);
} else {
  const pub = await api(`/deposit/depositions/${dep.id}/actions/publish`, { method: 'POST' });
  console.log('PUBLISHED');
  console.log('DOI:', pub.doi);
  console.log('Concept DOI (cite this for "latest version"):', pub.conceptdoi);
  console.log('Record:', pub.links.record_html ?? pub.links.html);
}
