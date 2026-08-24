/**
 * HTTP client for the ETL: timeout, retries with exponential backoff + jitter, global concurrency
 * limit and minimum interval between request starts, custom User-Agent (§7.1).
 * Optional on-disk raw cache (.etl-raw/) so local dev does not hammer upstream; disabled in CI
 * unless ETL_CACHE=1.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HTTP, PATHS } from '../config.ts';
import { log } from './log.ts';

const CACHE_ENABLED = process.env.ETL_CACHE === '1';
const CACHE_DIR = join(PATHS.raw, 'cache');

let active = 0;
let lastStart = 0;
const queue: (() => void)[] = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    const tryRun = () => {
      const now = Date.now();
      const wait = Math.max(0, lastStart + HTTP.minIntervalMs - now);
      if (active < HTTP.concurrency && wait === 0) {
        active++;
        lastStart = Date.now();
        resolve();
      } else if (active < HTTP.concurrency) {
        setTimeout(tryRun, wait);
      } else {
        queue.push(tryRun);
      }
    };
    tryRun();
  });
}
function release() {
  active--;
  const next = queue.shift();
  if (next) next();
}

export class HttpError extends Error {
  status: number;
  url: string;
  constructor(status: number, url: string, msg?: string) {
    super(msg ?? `HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

/** 429 and every 5xx (incl. Cloudflare 52x) are retriable; 4xx are not (spec §7.1). */
function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function cacheKey(url: string) {
  return createHash('sha1').update(url).digest('hex');
}

export interface FetchOpts {
  /** Accept header */
  accept?: string;
  /** If true, return a Buffer (binary). */
  binary?: boolean;
  /** Ignore cache for this call. */
  noCache?: boolean;
}

/** Fetch with retry/backoff/throttle. Returns text (or Buffer when binary). */
export async function fetchRaw(url: string, opts: FetchOpts = {}): Promise<string | Buffer> {
  const key = cacheKey(url);
  if (CACHE_ENABLED && !opts.noCache) {
    const p = join(CACHE_DIR, key + (opts.binary ? '.bin' : '.txt'));
    if (existsSync(p)) {
      return opts.binary ? readFileSync(p) : readFileSync(p, 'utf8');
    }
  }
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= HTTP.retries) {
    await acquire();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': HTTP.userAgent,
          Accept: opts.accept ?? (opts.binary ? '*/*' : 'application/json, text/plain, */*'),
        },
        redirect: 'follow',
      });
      if (!res.ok) {
        if (isRetriableStatus(res.status) && attempt < HTTP.retries) {
          throw new HttpError(res.status, url);
        }
        throw new HttpError(res.status, url);
      }
      const body = opts.binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
      if (CACHE_ENABLED && !opts.noCache) {
        mkdirSync(CACHE_DIR, { recursive: true });
        writeFileSync(join(CACHE_DIR, key + (opts.binary ? '.bin' : '.txt')), body);
      }
      return body;
    } catch (e) {
      lastErr = e;
      const retriable = e instanceof HttpError ? isRetriableStatus(e.status) : true; // network errors / aborts are retriable
      if (!retriable || attempt >= HTTP.retries) break;
      const backoff = 1000 * 2 ** attempt + Math.floor(Math.random() * 500);
      log.warn(`retry ${attempt + 1}/${HTTP.retries} in ${backoff}ms: ${String(e)} — ${url}`);
      await sleep(backoff);
      attempt++;
    } finally {
      clearTimeout(timer);
      release();
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Fetch JSON, stripping a UTF-8 BOM if present (§3.4). */
export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const text = (await fetchRaw(url, { ...opts, binary: false })) as string;
  return JSON.parse(text.replace(/^\uFEFF/, '')) as T;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  return (await fetchRaw(url, { ...opts, binary: false })) as string;
}

export async function fetchBuffer(url: string, opts: FetchOpts = {}): Promise<Buffer> {
  return (await fetchRaw(url, { ...opts, binary: true })) as Buffer;
}
