/**
 * Copy the public-facing reference documents into public/docs/ so the site never links into
 * the (currently private) repository. Runs from predev/prebuild; public/docs is generated.
 */
import { mkdirSync, copyFileSync } from 'node:fs';

mkdirSync('public/docs', { recursive: true });
for (const f of ['DATA-LICENSE.md', 'docs/DATA-DICTIONARY.md']) {
  const name = f.split('/').pop();
  copyFileSync(f, `public/docs/${name}`);
}
console.log('[copy-public-docs] DATA-LICENSE.md + DATA-DICTIONARY.md → public/docs/');
