/** Atomic file helpers: write to temp then rename; stable JSON serialization (LF, sorted keys optional). */
import {
  mkdirSync,
  writeFileSync,
  renameSync,
  existsSync,
  readFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export function writeFileAtomic(path: string, data: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** Deterministic JSON: LF line endings, no trailing spaces. Compact by default (data files). */
export function stableJson(value: unknown, pretty = false): string {
  return (pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)) + '\n';
}

export function writeJsonAtomic(path: string, value: unknown, pretty = false) {
  writeFileAtomic(path, stableJson(value, pretty));
}

export function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as T;
  } catch {
    return null;
  }
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function sha256File(path: string): string {
  return sha256(readFileSync(path));
}

export function rmrf(path: string) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

/** Recursively list files under dir, returning paths relative to dir with forward slashes. */
export function listFiles(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, rel));
    else out.push(rel);
  }
  return out.sort();
}
