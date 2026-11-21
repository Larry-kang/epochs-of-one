// v0.18.0 (item 4): random birthplace can be weighted by population (WPP 2024 mid-year population, CC BY 3.0 IGO).
import { test, expect } from '@playwright/test';

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`population-weighted birthplace option (${tag})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript(() => localStorage.setItem('epochs.lang.v1', 'zh-TW'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await page.locator('details.advanced summary').click();
    const sel = page.locator('#country');
    await expect(sel.locator('option[value="@pop"]')).toHaveCount(1);
    await expect(sel).toHaveValue('');
    const cap = page.locator('#odds .cap');
    await expect(cap).toContainText('新生兒');
    await sel.selectOption('@pop');
    await expect(cap).toContainText('人口');
    await page.locator('input[name=seed]').fill('dec4-pop');
    await page.locator('#go').click();
    await page.locator('#begin').waitFor();
  });
}

test('manual country still wins', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await page.locator('details.advanced summary').click();
  await page.locator('#country').selectOption('JPN');
  await page.locator('input[name=seed]').fill('dec4-fixed');
  await page.locator('#go').click();
  await page.locator('#begin').waitFor();
  await expect(page.locator('body')).toContainText(/日本|Japan/);
});
