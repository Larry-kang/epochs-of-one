// v0.13.0: "compare with my country" card on the death record.
import { test, expect } from '@playwright/test';
import { toBirth, skipToEnd } from './auto.ts';

test('compare card: default country (zh-TW) and line text', async ({ page }) => {
  await toBirth(page, 'v0130-compare', { country: 'NGA', year: 1990 });
  await page.locator('#begin').click();
  await skipToEnd(page);
  await expect(page.locator('#compare')).toBeVisible();
  await expect(page.locator('#cmp-country')).toHaveValue('TWN');
  await expect(page.locator('#cmp-line')).toContainText('多活');
  await page.locator('#cmp-country').selectOption('NGA');
  await expect(page.locator('#cmp-line')).toContainText('奈及利亞');
  expect(await page.evaluate(() => localStorage.getItem('epochs.mycountry.v1'))).toBe('NGA');
  await expect(page.locator('.cmp-table tbody tr')).toHaveCount(3);
});

test('compare card fits a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toBirth(page, 'v0130-compare', { country: 'NGA', year: 1990 });
  await page.locator('#begin').click();
  await skipToEnd(page);
  await expect(page.locator('#compare')).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(391);
});
