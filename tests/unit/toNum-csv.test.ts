import { describe, it, expect } from 'vitest';
import { toNum, toInt } from '../../src/lib/toNum';
import { toCsv, parseCsv, escapeCsvCell } from '../../src/lib/csv';
import { sanitizeText } from '../../scripts/etl/sources/idmc-idu';

describe('toNum (UNHCR type instability, §3.2)', () => {
  it('"-" → null (not reported), "0" → 0 (reported zero), number → number', () => {
    expect(toNum('-')).toBeNull();
    expect(toNum('0')).toBe(0);
    expect(toNum(0)).toBe(0);
    expect(toNum(12345)).toBe(12345);
    expect(toNum('12,345')).toBe(12345);
  });
  it('null/undefined/garbage → null', () => {
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum('abc')).toBeNull();
    expect(toNum(NaN)).toBeNull();
    expect(toNum(Infinity)).toBeNull();
    expect(toNum({})).toBeNull();
  });
  it('toInt rounds', () => {
    expect(toInt('12.6')).toBe(13);
    expect(toInt('-')).toBeNull();
  });
});

describe('csv (RFC 4180)', () => {
  it('escapes quotes, commas and newlines; null → empty', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(0)).toBe('0');
  });
  it('writes strict CSV without comment lines by default', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        [1, null],
        ['x,y', 0],
      ],
    );
    expect(csv).toBe('a,b\n1,\n"x,y",0\n');
    expect(csv.startsWith('#')).toBe(false);
  });
  it('optionally prepends # comment lines', () => {
    const csv = toCsv(['a'], [[1]], { comments: ['source: X', 'multi\nline'] });
    expect(csv).toBe('# source: X\n# multi line\na\n1\n');
  });
  it('parses what it writes (round trip incl. BOM and CRLF)', () => {
    const rows = [
      ['iso3', 'name', 'v'],
      ['SYR', 'Syrian Arab Rep.', '1'],
      ['X', 'a "q", b', ''],
      ['Y', 'multi\nline', '0'],
    ];
    const text = String.fromCharCode(0xfeff) + toCsv(rows[0]!, rows.slice(1), { eol: '\r\n' });
    expect(parseCsv(text)).toEqual(rows);
  });
  it('null and 0 are distinguishable in CSV', () => {
    const csv = toCsv(['v'], [[null], [0]]);
    expect(csv.split('\n')[1]).toBe('');
    expect(csv.split('\n')[2]).toBe('0');
  });
});

describe('IDU sanitizeText', () => {
  it('strips tags and entities', () => {
    expect(
      sanitizeText('<b> Myanmar:   686 displacements </b> <br> According to &amp; MFSD &lt;x&gt;'),
    ).toBe('Myanmar: 686 displacements According to & MFSD <x>');
    expect(sanitizeText('<script>alert(1)</script>hi')).toBe('alert(1)hi');
    expect(sanitizeText(null)).toBe('');
  });
});
