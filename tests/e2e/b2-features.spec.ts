// Batch 2 e2e: language picker, yearly focus, spend sheet, same-second companions, small decision card.
import { test, expect } from '@playwright/test';
import { toBirth, playToAge } from './auto.ts';

test('B2 language picker switches the whole UI and persists', async ({ page }) => {
  await page.goto('./');
  await page.locator('.foot .lang-sel').selectOption('en');
  await expect(page.locator('#go')).toContainText('Be born');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.locator('#go')).toContainText('Be born');
  await page.locator('.foot .lang-sel').selectOption('ja');
  await expect(page.locator('#go')).toContainText('生まれる');
  await page.locator('.foot .lang-sel').selectOption('zh-TW');
  await expect(page.locator('#go')).toContainText('出生');
});

test('B2 music toggle (generated in the browser, off by default)', async ({ page }) => {
  await page.goto('./');
  const b = page.locator('.foot .music-t');
  await expect(b).toHaveAttribute('aria-pressed', 'false');
  await b.click(); await expect(b).toHaveAttribute('aria-pressed', 'true');
  await b.click(); await expect(b).toHaveAttribute('aria-pressed', 'false');
});

test('B2 focus pills, spend sheet (pauses time, buy), companions panel', async ({ page }) => {
  test.setTimeout(180_000); // v0.8.1: now plays on to 15 for the spend card
  await toBirth(page, 'b2-feat', { country: 'TWN', year: 1990 });
  await page.locator('#begin').click();
  await page.locator('.spd[data-speed="16"]').click();
  await expect(page.locator('#focuscard')).toBeVisible({ timeout: 60000 });   // from age 6
  await page.locator('#pause').click();
  const pill = page.locator('.fpill[data-focus="study"]');
  await pill.click();
  await expect(page.locator('.fpill[data-focus="study"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#peers li')).toHaveCount(5);
  await playToAge(page, 15); // v0.8.1: the spend card exists from 15
  await page.locator('#spend').click();
  await expect(page.locator('#spend-sheet')).toBeVisible();
  const age = await page.locator('#age').textContent();
  await page.waitForTimeout(1500);
  await expect(page.locator('#age')).toHaveText(age!);
  const free = page.locator('#spend-sheet [data-buy="library"]');
  if (await free.count()) { await free.click(); await expect(page.locator('#toast')).toBeVisible(); }
  await page.locator('#spend-close').click();
  await expect(page.locator('#spend-sheet')).toHaveCount(0);
});
