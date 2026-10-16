// batch 3 #5: light/dark theme toggle (auto → light → dark), persisted, overrides the OS preference.
import { test, expect } from '@playwright/test';

test('B3 theme toggle cycles and persists, overriding the OS scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  const b = page.locator('.foot .theme-t');
  await expect(b).toHaveAttribute('data-theme-v', 'auto');
  await b.click(); await expect(b).toHaveAttribute('data-theme-v', 'light'); expect(await bg()).toBe(light);
  await b.click(); await expect(b).toHaveAttribute('data-theme-v', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await bg()).not.toBe(light);
  await page.screenshot({ path: 'shots/batch3/desktop-home-dark.png' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('.foot .theme-t').click(); await page.locator('.foot .theme-t').click();   // dark → auto → light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await bg()).toBe(light);
});
