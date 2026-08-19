/**
 * promote.ts — staging → public/data/v1, per source group, atomically per group (§7.8).
 *
 *   node scripts/etl/promote.ts [--in .etl-staging] [--to public/data/v1] [--fail-if-stale-days 3]
 *
 * Requires <in>/_validation.json (from validate.ts). Groups that passed are copied over; groups that
 * failed (or were not produced) keep the previously published files and their sources are marked
 * stale in the final sources.json. manifest.json is recomputed over the final tree.
 */
import { join } from 'node:path';
import { existsSync, readFileSync, cpSync } from 'node:fs';
import { PATHS, SOURCE_IDS, THRESHOLDS, type SourceId } from './config.ts';
import { readJsonIfExists, writeJsonAtomic, rmrf, listFiles } from './lib/atomic.ts';
import { markStale } from './lib/provenance.ts';
import { buildManifest } from './run.ts';
import type { Manifest, SourcesFile } from '../../src/lib/types.ts';
import { log } from './lib/log.ts';

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const IN = arg('--in') ?? PATHS.staging;
const TO = arg('--to') ?? PATHS.publicData;
const FAIL_STALE_DAYS = Number(arg('--fail-if-stale-days') ?? THRESHOLDS.staleDaysBeforeAlert);

type Group = 'countries' | 'geo' | 'core' | 'nowcast' | 'idu';
const GROUP_PATHS: Record<Group, string[]> = {
  countries: ['countries.json'],
  geo: ['geo'],
  core: [
    'stock',
    'country',
    'flows',
    'downloads',
    'datapackage.json',
    'metrics.json',
    'unmatched-report.json',
  ],
  nowcast: ['live/nowcast.json'],
  idu: ['live/idu-latest.json'],
};
const GROUP_SOURCES: Record<Group, SourceId[]> = {
  countries: ['unhcr_countries'],
  geo: ['natural_earth'],
  core: [
    'unhcr_population',
    'unhcr_demographics',
    'unhcr_idmc',
    'unhcr_solutions',
    'unhcr_asylum_applications',
    'unhcr_footnotes',
    'wpp_population',
  ],
  nowcast: ['unhcr_nowcasting'],
  idu: ['idmc_idu'],
};

function main() {
  const validation = readJsonIfExists<{
    groups: Record<Group | 'meta', boolean>;
    produced: Record<Group | 'meta', boolean>;
  }>(join(IN, '_validation.json'));
  if (!validation) throw new Error(`${IN}/_validation.json missing — run validate.ts first`);
  const stagingSources = readJsonIfExists<SourcesFile>(join(IN, 'sources.json')) ?? {};
  const stagingManifest = readJsonIfExists<Manifest>(join(IN, 'manifest.json'));
  const prevSources = readJsonIfExists<SourcesFile>(join(TO, 'sources.json')) ?? {};
  const prevManifest = readJsonIfExists<Manifest>(join(TO, 'manifest.json'));
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  if (!validation.groups.meta)
    throw new Error('meta checks failed (manifest/sources/metrics) — refusing to promote anything');

  const promoted: Group[] = [];
  const kept: Group[] = [];
  for (const g of Object.keys(GROUP_PATHS) as Group[]) {
    const pass = validation.groups[g] && validation.produced[g];
    if (!pass) {
      kept.push(g);
      continue;
    }
    for (const rel of GROUP_PATHS[g]) {
      const src = join(IN, rel);
      const dst = join(TO, rel);
      if (!existsSync(src)) continue;
      rmrf(dst);
      cpSync(src, dst, { recursive: true });
    }
    promoted.push(g);
  }
  log.info(
    `promoted: ${promoted.join(', ') || '(none)'}; kept previous: ${kept.join(', ') || '(none)'}`,
  );

  // sources.json: take staging entries for promoted groups; for kept groups carry previous entry and mark stale
  const final: SourcesFile = {};
  for (const id of SOURCE_IDS) {
    const group = (Object.keys(GROUP_SOURCES) as Group[]).find((g) =>
      GROUP_SOURCES[g].includes(id),
    );
    const fromStaging = stagingSources[id];
    const fromPrev = prevSources[id];
    if (group && kept.includes(group)) {
      // the group's files were not replaced: whatever the staging run says, the published data is the old one
      final[id] = fromPrev
        ? fromStaging?.status === 'stale'
          ? fromStaging
          : markStale(
              fromPrev,
              id,
              `group ${group} not promoted (validation failed or not produced)`,
              now,
            )
        : (fromStaging ?? markStale(null, id, 'never succeeded', now));
      // if the previous entry was already stale keep its stale_since
      if (fromPrev?.status === 'stale' && fromPrev.stale_since)
        final[id]!.stale_since = fromPrev.stale_since;
      if (
        fromPrev &&
        fromPrev.status === 'ok' &&
        final[id]!.status === 'stale' &&
        !final[id]!.stale_since
      )
        final[id]!.stale_since = now;
    } else if (fromStaging) {
      final[id] = fromStaging;
    } else if (fromPrev) {
      final[id] = fromPrev;
    }
  }
  writeJsonAtomic(join(TO, 'sources.json'), final, true);

  // manifest over the final tree
  const yearMax =
    (promoted.includes('core') ? stagingManifest?.year_max : prevManifest?.year_max) ??
    stagingManifest?.year_max ??
    0;
  const yearMin = stagingManifest?.year_min ?? prevManifest?.year_min ?? 1951;
  const stockFiles =
    (promoted.includes('core') ? stagingManifest?.stock_files : prevManifest?.stock_files) ?? [];
  const manifest = buildManifest(TO, { yearMin, yearMax, stockFiles, prev: prevManifest, now });
  writeJsonAtomic(join(TO, 'manifest.json'), manifest, true);
  log.ok(
    `manifest: snapshot ${manifest.snapshot_id}, ${Object.keys(manifest.files).length} files, generated_at ${manifest.generated_at}${prevManifest && prevManifest.snapshot_id === manifest.snapshot_id ? ' (unchanged)' : ''}`,
  );

  // health: stale durations
  let worst = 0;
  for (const [id, s] of Object.entries(final)) {
    if (s.status !== 'stale') continue;
    const days = s.stale_since ? (Date.parse(now) - Date.parse(s.stale_since)) / 86_400_000 : 0;
    worst = Math.max(worst, days);
    log.warn(`${id}: stale for ${days.toFixed(1)} days — ${s.last_error ?? ''}`);
  }
  const files = listFiles(TO).length;
  log.info(`published tree: ${files} files`);
  if (worst >= FAIL_STALE_DAYS) {
    log.error(
      `at least one source has been stale for ≥ ${FAIL_STALE_DAYS} days — failing so the alert fires`,
    );
    process.exit(1);
  }
}

main();
