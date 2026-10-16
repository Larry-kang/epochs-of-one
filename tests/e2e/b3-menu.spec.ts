// batch 3 #4: ⋯ menu — journal (local notes), family tree, theme and music toggles; sheets pause time.
import { test, expect } from '@playwright/test';
import { toBirth } from './auto.ts';

test('B3 menu: journal saves a local note, family tree, theme + music in the menu', async ({ page }) => {
  await toBirth(page, 'b3-menu', { country: 'TWN', year: 1980 });
  await page.locator('#begin').click();
  await page.locator('#more').click();
  for (const sel of ['#journal-m', '#tree-m', '#menu .theme-t', '#menu .music-t', '#leave']) await expect(page.locator(sel)).toBeVisible();
  await page.locator('#journal-m').click();
  await expect(page.locator('#journal')).toBeVisible();
  const age = await page.locator('#age').textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('#age')).toHaveText(age!);   // paused while open
  await page.locator('#j-text').fill('第一次寫日記');
  await page.locator('#j-save').click();
  await expect(page.locator('#j-list')).toContainText('第一次寫日記');
  await page.screenshot({ path: 'shots/batch3/desktop-journal.png' });
  await page.locator('#journal [data-close]').click();
  await page.locator('#more').click(); await page.locator('#journal-m').click();
  await expect(page.locator('#j-list')).toContainText('第一次寫日記');   // persisted
  await page.locator('#journal [data-close]').click();
  await page.locator('#more').click(); await page.locator('#tree-m').click();
  await expect(page.locator('#tree .tn.me')).toBeVisible();
  await expect(page.locator('#tree .tn')).toHaveCount(await page.locator('#tree .tn').count());
  expect(await page.locator('#tree .tn').count()).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: 'shots/batch3/desktop-family-tree.png' });
  await page.locator('#tree [data-close]').click();
  await page.locator('#more').click(); await page.locator('#menu .theme-t').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
