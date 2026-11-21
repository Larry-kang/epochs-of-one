// v0.16.0 (item 3): sensitive-content notice + official help resources (sourced, checked 2026-11-21).
import { test, expect } from '@playwright/test';
import { toBirth, skipToEnd } from './auto.ts';

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`notice shows once, help page lists sourced lines (${tag})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript(() => { if (!localStorage.getItem('epochs.lang.v1')) localStorage.setItem('epochs.lang.v1', 'zh-TW'); });
    await page.goto('./');
    const n = page.locator('#notice');
    await expect(n).toBeVisible();
    await page.locator('#notice-help').click();
    const hp = page.locator('#help-page');
    await expect(hp).toBeVisible();
    const first = hp.locator('li.help-item').first();
    await expect(first.locator('a[href="tel:1925"]')).toBeVisible();
    await expect(first.locator('a.help-src')).toHaveAttribute('href', /^https:\/\/dep\.mohw\.gov\.tw\//);
    await expect(hp).toContainText('2026-11-21');
    expect(await hp.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.locator('#back').click();
    await page.locator('#notice-ok').click();
    await expect(n).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#go')).toBeVisible();
    await expect(page.locator('#notice')).toHaveCount(0);
    await expect(page.locator('#help-btn')).toBeVisible();
  });
}

test('Escape closes the help dialog and returns focus to its button', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('epochs.lang.v1', 'ja'));
  await page.goto('./');
  await page.locator('#help-btn').click();
  await expect(page.locator('#help-page a[href="tel:0570064556"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-page')).toHaveCount(0);
  await expect(page.locator('#help-btn')).toBeFocused();
});

test('Korean UI lists 109 first', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('epochs.lang.v1', 'ko'));
  await page.goto('./');
  await page.locator('#help-btn').click();
  await expect(page.locator('#help-page li.help-item').first().locator('a[href="tel:109"]')).toBeVisible();
});

test('death record links to help resources', async ({ page }) => {
  await toBirth(page, 'dec3-help', { country: 'TWN', year: 1950 });
  await page.locator('#begin').click();
  await skipToEnd(page);
  await page.locator('#death-help').click();
  await expect(page.locator('#help-page')).toBeVisible();
});
