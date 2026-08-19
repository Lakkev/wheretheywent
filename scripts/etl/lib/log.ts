/** Tiny structured logger for ETL output (GitHub Actions friendly). */
const t0 = Date.now();
function ts() {
  return ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
}
export const log = {
  info: (msg: string, ...rest: unknown[]) => console.log(`[${ts()}] ${msg}`, ...rest),
  warn: (msg: string, ...rest: unknown[]) => console.warn(`[${ts()}] ⚠ ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) => console.error(`[${ts()}] ✖ ${msg}`, ...rest),
  ok: (msg: string, ...rest: unknown[]) => console.log(`[${ts()}] ✔ ${msg}`, ...rest),
  group: (title: string) => console.log(`\n[${ts()}] ── ${title} ──`),
};
