// v0.19.0 (item 2): Taiwan lives show NT$ (World Bank ICP 2021 GDP PPP, CC BY 4.0); About cites the source and date.
import { test, expect } from '@playwright/test';
import { toBirth } from './auto.ts';

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`Taiwan life shows NT$ and About cites ICP 2021 (${tag})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript(() => localStorage.setItem('epochs.lang.v1', 'zh-TW'));
    await toBirth(page, 'dec2-twd', { country: 'TWN', year: 1990 });
    await page.locator('#begin').click();
    await expect(page.locator('body')).toContainText('NT$', { timeout: 30000 });
    await page.goto('./');
    await page.locator('#about').click();
    await expect(page.locator('#twd-source')).toContainText('ICP 2021');
    await expect(page.locator('#twd-source')).toContainText('2026-11-21');
  });
}
