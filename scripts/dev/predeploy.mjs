#!/usr/bin/env node
/**
 * S4: deploy safety.
 *  - `check`: refuse to deploy from a dirty working tree — what goes live must be a commit
 *    that exists in history, or the audit trail (git log over data files) is a lie.
 *  - `stamp`: after `astro build`, write dist/build-info.json with the exact commit + build time
 *    so any deployed byte can be traced back to a commit.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';

const mode = process.argv[2];
const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();

if (mode === 'check') {
  const dirty = sh('git status --porcelain');
  if (dirty) {
    console.error('[predeploy] working tree is dirty — commit before deploying:\n' + dirty);
    process.exit(1);
  }
  console.log('[predeploy] tree clean at ' + sh('git rev-parse --short HEAD'));
} else if (mode === 'stamp') {
  if (!existsSync('dist')) {
    console.error('[predeploy] dist/ not found — run the build first');
    process.exit(1);
  }
  const info = {
    git_commit: sh('git rev-parse HEAD'),
    built_at: new Date().toISOString(),
  };
  writeFileSync('dist/build-info.json', JSON.stringify(info, null, 2) + '\n');
  console.log('[predeploy] stamped dist/build-info.json @ ' + info.git_commit.slice(0, 8));
} else {
  console.error('usage: node scripts/dev/predeploy.mjs check|stamp');
  process.exit(1);
}
