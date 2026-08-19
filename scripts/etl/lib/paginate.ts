/**
 * UNHCR pagination protocol (§7.2):
 *   1. GET ...&limit=1 → maxPages == total row count
 *   2. pages = ceil(total / PAGE_LIMIT); fetch each page with limit=PAGE_LIMIT
 *   3. every page re-checks maxPages; if it changes mid-run (upstream publishing) → UnstableError
 */
import { PAGE_LIMIT, UNHCR_BASE } from '../config.ts';
import { fetchJson } from './http.ts';
import { log } from './log.ts';

export interface UnhcrPage<T> {
  page: number;
  maxPages: number;
  total?: unknown;
  items: T[];
}

export class UnstableSourceError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'UnstableSourceError';
  }
}

export function unhcrUrl(
  endpoint: string,
  params: Record<string, string | number | boolean>,
): string {
  const u = new URL(`${UNHCR_BASE}/${endpoint.replace(/^\/|\/$/g, '')}/`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

/** Count rows for a query (one request with limit=1). */
export async function countRows(
  endpoint: string,
  params: Record<string, string | number | boolean>,
) {
  const probe = await fetchJson<UnhcrPage<unknown>>(
    unhcrUrl(endpoint, { ...params, limit: 1, page: 1 }),
  );
  return probe.maxPages ?? 0;
}

/** Fetch all rows for a query. `params` must already include cf_type=ISO where relevant. */
export async function fetchAll<T>(
  endpoint: string,
  params: Record<string, string | number | boolean>,
  label = endpoint,
): Promise<{ items: T[]; totalRows: number; pages: number }> {
  const totalRows = await countRows(endpoint, params);
  if (totalRows === 0) return { items: [], totalRows: 0, pages: 0 };
  const pages = Math.ceil(totalRows / PAGE_LIMIT);
  log.info(`${label}: ${totalRows} rows → ${pages} page(s)`);
  const items: T[] = [];
  const tasks: Promise<void>[] = [];
  const results: T[][] = new Array(pages);
  for (let p = 1; p <= pages; p++) {
    tasks.push(
      (async () => {
        const page = await fetchJson<UnhcrPage<T>>(
          unhcrUrl(endpoint, { ...params, limit: PAGE_LIMIT, page: p }),
        );
        // maxPages here is pages at PAGE_LIMIT; recompute expected
        const expectPages = pages;
        if (page.maxPages !== expectPages) {
          throw new UnstableSourceError(
            `${label}: maxPages changed mid-run (expected ${expectPages}, page ${p} says ${page.maxPages}) — upstream may be publishing`,
          );
        }
        results[p - 1] = page.items ?? [];
      })(),
    );
  }
  await Promise.all(tasks);
  for (const r of results) items.push(...r);
  if (items.length !== totalRows) {
    throw new UnstableSourceError(
      `${label}: row count changed mid-run (expected ${totalRows}, got ${items.length})`,
    );
  }
  return { items, totalRows, pages };
}
