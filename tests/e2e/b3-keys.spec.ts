// batch 3 #8: Enter takes the default choice; Esc closes the menu, panels, prompts and sheets.
import { test, expect } from '@playwright/test';
import { toBirth, playToAge } from './auto.ts';

test('B3 Enter = default choice, Esc closes menu / panel / sheet', async ({ page }) => {
  test.setTimeout(120000);
  await toBirth(page, 'b2-shot-m390', { country: 'TWN', year: 1990 });   // a seed with an early small decision
  await page.locator('#begin').click();
  await page.locator('.spd[data-speed="16"]').evaluate((x) => (x as HTMLElement).click());
  const card = page.locator('#choice:not([hidden])');
  await expect(card).toBeVisible({ timeout: 90000 });
  const def = await card.getAttribute('data-def');
  expect(def).toBeTruthy();
  const label = (await card.locator(`.opt[data-opt="${def}"] b`).textContent())!;
  await page.locator('#choice h2').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#log')).toContainText(label, { timeout: 5000 });
  while (await card.count()) { await page.locator('#choice h2').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200); }
  // menu
  await page.locator('#more').click(); await expect(page.locator('#menu')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#menu')).toBeHidden();
  // panel (loan) → Esc
  await page.locator('#pause').click();
  await page.evaluate(() => (document.querySelector('#loan') as HTMLButtonElement).click()); await expect(page.locator('#panel')).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Escape'); await expect(page.locator('#panel')).toBeHidden();
  // native dialog sheet → Esc
  await playToAge(page, 15); // v0.8.1: the spend card exists from 15
  await page.locator('#spend').click(); await expect(page.locator('#spend-sheet')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#spend-sheet')).toHaveCount(0);
});
