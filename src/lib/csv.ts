/**
 * RFC 4180 CSV writer (strict by default — no comment lines, CRLF optional).
 * Shared by ETL downloads and client-side "download this view".
 */
export type CsvCell = string | number | null | undefined | boolean;

export interface CsvOptions {
  /** Line terminator. RFC 4180 says CRLF; we default to LF for git-friendliness of bulk files. */
  eol?: '\n' | '\r\n';
  /** Optional leading `#` comment lines (NOT strict RFC 4180 — only when the user opts in). */
  comments?: string[];
  /** Representation of null (not reported). Default: empty field. */
  nullAs?: string;
}

export function escapeCsvCell(v: CsvCell, nullAs = ''): string {
  if (v === null || v === undefined) return nullAs;
  const s = typeof v === 'string' ? v : String(v);
  // quote if contains delimiter, quote, CR/LF, or leading/trailing spaces
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv(
  header: readonly string[],
  rows: readonly (readonly CsvCell[])[],
  opts: CsvOptions = {},
): string {
  const eol = opts.eol ?? '\n';
  const nullAs = opts.nullAs ?? '';
  const lines: string[] = [];
  if (opts.comments && opts.comments.length) {
    for (const c of opts.comments) lines.push('# ' + c.replace(/\r?\n/g, ' '));
  }
  lines.push(header.map((h) => escapeCsvCell(h)).join(','));
  for (const r of rows) lines.push(r.map((c) => escapeCsvCell(c, nullAs)).join(','));
  return lines.join(eol) + eol;
}

/** Minimal RFC 4180 parser (used in tests and the WPP loader). Handles quotes, CRLF, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  const n = text.length;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM
  while (i < n) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
