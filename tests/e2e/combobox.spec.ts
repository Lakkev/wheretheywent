import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

/**
 * The country search boxes carried role=listbox/option but only handled Enter, and every option
 * was its own tab stop. An axe scan passes that markup — the roles are right, the interaction
 * model is missing — so these assertions drive the keyboard instead of scanning the DOM.
 */
test('map search: arrow keys reach the list, Enter selects, Escape backs out', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  // getByRole('combobox') also matches <select>; target the search input by what it controls.
  const box = page.locator('input[aria-controls="rail-search-listbox"]');
  await box.click();
  // "sudan" matches Sudan and South Sudan — two options, so wrapping is observable.
  await box.fill('sudan');
  const list = page.locator('#rail-search-listbox');
  await expect(list).toBeVisible();
  expect(await list.locator('[role=option]').count()).toBeGreaterThan(1);
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  await expect(box).not.toHaveAttribute('aria-activedescendant', /.+/);

  // Down highlights the first option and the input keeps focus: activedescendant, not roving tab
  await box.press('ArrowDown');
  const first = await box.getAttribute('aria-activedescendant');
  expect(first).toBeTruthy();
  await expect(box).toBeFocused();
  await expect(page.locator(`#${first}`)).toHaveClass(/is-active/);

  await box.press('ArrowDown');
  expect(await box.getAttribute('aria-activedescendant')).not.toBe(first);
  await box.press('ArrowUp');
  expect(await box.getAttribute('aria-activedescendant')).toBe(first);

  // End/Home reach the ends of the list
  await box.press('End');
  const last = await box.getAttribute('aria-activedescendant');
  expect(last).not.toBe(first);
  await box.press('Home');
  expect(await box.getAttribute('aria-activedescendant')).toBe(first);

  // Escape drops the highlight first, then clears the query
  await box.press('Escape');
  await expect(box).not.toHaveAttribute('aria-activedescendant', /.+/);
  await box.press('Escape');
  await expect(box).toHaveValue('');

  // Enter on a highlighted option selects that country. ("uga" would also match Portugal —
  // substring search, so the test names the country it means.)
  await box.fill('Uganda');
  await box.press('ArrowDown');
  await box.press('Enter');
  await page.waitForURL(/c=UGA/);
});

test('map search: options are not tab stops', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  const box = page.locator('input[aria-controls="rail-search-listbox"]');
  await box.click();
  await box.fill('Uganda');
  await expect(page.locator('#rail-search-listbox')).toBeVisible();
  const optionTabIndexes = await page
    .locator('#rail-search-listbox [role=option]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).tabIndex));
  expect(optionTabIndexes.every((t) => t < 0)).toBe(true);
  // Tab leaves the widget rather than walking twelve results
  await box.press('Tab');
  const stillInList = await page.evaluate(
    () => !!document.activeElement?.closest('#rail-search-listbox'),
  );
  expect(stillInList).toBe(false);
});

test('compare search: same keyboard model, and it adds the country', async ({ page }) => {
  await page.goto('/compare');
  const box = page.locator('input[aria-controls="compare-add-listbox"]');
  await box.waitFor({ timeout: 30_000 });
  await box.fill('Uganda');
  await expect(page.locator('#compare-add-listbox')).toBeVisible();
  await box.press('ArrowDown');
  await expect(box).toHaveAttribute('aria-activedescendant', /compare-add-opt-0/);
  await box.press('Enter');
  await page.waitForURL(/cmp=UGA/);
});
