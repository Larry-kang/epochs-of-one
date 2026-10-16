import { test, expect } from '@playwright/test';
import { skipToEnd, toBirth } from './auto.ts';

test('B1 auto-choice: countdown bar appears and resolves the card on its own', async ({ page }) => {
  await toBirth(page, 'auto-1', { country: 'TWN', year: 1995 });
  await page.locator('#begin').click();
  const opt = page.locator('#choice .opt').first();
  for (let i = 0; i < 12 && !(await opt.isVisible()); i++) { await page.locator('#skip-dec').click(); await expect(page.locator('#toast')).toBeVisible({ timeout: 60000 }); }
  await expect(page.locator('#auto-now')).toBeVisible();
  await page.locator('#auto-now').click();
  await expect(page.locator('#auto')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#choice .autobar')).toBeVisible();
  await expect(page.locator('#choice')).toBeHidden({ timeout: 30000 });
});

test('B1 death page share sheet and past-life reopen from home', async ({ page }) => {
  await toBirth(page, 'share-1');
  await page.locator('#begin').click();
  await skipToEnd(page);
  await expect(page.locator('#record')).toBeVisible({ timeout: 30000 });
  const name = (await page.locator('#rec-name').textContent())!;
  await page.locator('#share-open').click();
  await expect(page.locator('#share-img')).toBeVisible();
  await page.locator('#sh-close').click();
  await page.goto('./');
  await page.locator('.past-open').first().click();
  await expect(page.locator('#rec-name')).toHaveText(name);
});
