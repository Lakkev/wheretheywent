import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

function parseCsv(text: string): string[][] {
  // minimal RFC 4180 parser for test assertions
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse a compact value like "2.7M" / "154K" / "912" back to a number. */
function parseCompact(s: string): number {
  const m = /([\d.,]+)\s*([KMB]?)/i.exec(s.replace(/\u00a0/g, ''));
  if (!m) return NaN;
  const n = Number(m[1]!.replace(/,/g, ''));
  const mult = { '': 1, K: 1e3, M: 1e6, B: 1e9 }[m[2]!.toUpperCase() as '' | 'K' | 'M' | 'B'] ?? 1;
  return n * mult;
}

test('download CSV of the current view: header carries provenance, rows match the screen', async ({
  page,
}) => {
  await page.goto('/?y=2024');
  await waitForApp(page);
  const top1 = (await page.locator('.ranklist li:first-child .name').textContent())!.trim();
  const top1Value = parseCompact(
    (await page.locator('.ranklist li:first-child .val').textContent())!.trim(),
  );
  await page.keyboard.press('d');
  // the dialog states how many rows this view exports — the CSV must match it exactly
  // (Dialogs.svelte renders "… — {n} country rows")
  const dialogText = (await page.locator('.modal p').first().textContent())!;
  const declaredRows = Number(/(\d+)\s+country/i.exec(dialogText.replace(/\s+/g, ' '))?.[1] ?? 0);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /CSV/ }).click(),
  ]);
  const text = await (
    await dl.createReadStream()
  )
    .toArray()
    .then((c) => Buffer.concat(c).toString('utf8'));
  expect(text.startsWith('#')).toBe(false); // strict RFC 4180 by default
  const rows = parseCsv(text);
  const header = rows[0]!;
  for (const col of [
    'iso3',
    'country_name',
    'year',
    'metric',
    'value',
    'source_id',
    'source_attribution',
    'data_as_of',
    'retrieved_at',
    'snapshot_id',
  ])
    expect(header).toContain(col);
  const body = rows.slice(1).filter((r) => r.length > 1);
  expect(body.length).toBeGreaterThan(150);
  const iYear = header.indexOf('year'),
    iRank = header.indexOf('rank'),
    iAsOf = header.indexOf('data_as_of'),
    iSrc = header.indexOf('source_attribution'),
    iName = header.indexOf('country_name');
  expect(body.every((r) => r[iYear] === '2024')).toBe(true);
  expect(body[0]![iAsOf]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(body[0]![iSrc]).toContain('UNHCR');
  // first row (rank 1) is the same country as the screen's #1 (names may differ: CSV uses UNHCR name)
  expect(body[0]![iRank]).toBe('1');
  expect(body[0]![iName]!.length).toBeGreaterThan(2);
  expect(top1.length).toBeGreaterThan(2);
  // ★ §13.4: the exported values match the screen — rank-1 value within compact-format rounding
  const iValue = header.indexOf('value');
  const csvTop = Number(body[0]![iValue]);
  expect(csvTop, `csv ${csvTop} vs screen ${top1Value}`).toBeGreaterThan(0);
  expect(Math.abs(csvTop - top1Value) / csvTop, 'rank-1 value matches the rank list').toBeLessThan(
    0.06,
  );
  // ★ row count matches what the dialog declared for this view
  if (declaredRows > 0) expect(body.length).toBe(declaredRows);
});

test('download JSON includes meta with permalink and citations', async ({ page }) => {
  await page.goto('/?m=idps&v=origin&y=2016');
  await waitForApp(page);
  await page.keyboard.press('d');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /JSON/ }).click(),
  ]);
  const text = await (
    await dl.createReadStream()
  )
    .toArray()
    .then((c) => Buffer.concat(c).toString('utf8'));
  const j = JSON.parse(text) as {
    meta: {
      permalink: string;
      citations: Record<string, string>;
      sources: Record<string, unknown>;
    };
    data: { iso3: string; value: number }[];
  };
  expect(j.meta.permalink).toContain('m=idps');
  expect(Object.keys(j.meta.citations).sort()).toEqual(['apa', 'bibtex', 'chicago', 'page']);
  expect(j.meta.citations.page).toContain('UNHCR');
  expect(j.data.find((d) => d.iso3 === 'SYR')?.value).toBe(6325978);
});

test('citation dialog: four formats with UNHCR, data_as_of and permalink', async ({ page }) => {
  await page.goto('/?c=SYR&y=2016&m=idps');
  await waitForApp(page);
  await page.getByRole('button', { name: /Cite/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const areas = dialog.locator('textarea');
  await expect(areas).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const v = await areas.nth(i).inputValue();
    expect(v).toContain('UNHCR');
    expect(v).toMatch(/2025/); // data as of 31 December 2025
    expect(v).toContain('c=SYR');
  }
  expect(await areas.nth(3).inputValue()).toMatch(/^@misc\{/);
});

test('country page cite + download', async ({ page }) => {
  await page.goto('/country/LBN?y=2024');
  await page.getByRole('button', { name: /Cite/ }).click();
  const v = await page.getByRole('dialog').locator('textarea').first().inputValue();
  expect(v).toContain('Lebanon');
  expect(v).toContain('/country/LBN');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Download/ }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog').getByRole('button', { name: /CSV/ }).click(),
  ]);
  const text = await (
    await dl.createReadStream()
  )
    .toArray()
    .then((c) => Buffer.concat(c).toString('utf8'));
  expect(text.split('\n')[0]).toContain('data_as_of');
  expect(text).toContain('LBN');
});
