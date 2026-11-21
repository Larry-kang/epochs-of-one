// v0.14.0: first visit preselects the UI language from the browser; a saved choice always wins.
import { test, expect } from '@playwright/test';

test.describe('v0.14.0 browser language, Japanese browser', () => {
  test.use({ locale: 'ja-JP' });

  test('first visit opens in Japanese without saving the choice', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.locator('select.lang-sel')).toHaveValue('ja');
    expect(await page.evaluate(() => localStorage.getItem('epochs.lang.v1'))).toBeNull();
  });

  test('a saved language is kept', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('epochs.lang.v1', 'zh-TW'));
    await page.goto('./');
    await expect(page.locator('select.lang-sel')).toHaveValue('zh-TW');
  });
});

test.describe('v0.14.0 browser language, unsupported language', () => {
  test.use({ locale: 'fr-FR' });
  test('falls back to English', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('select.lang-sel')).toHaveValue('en');
  });
});
