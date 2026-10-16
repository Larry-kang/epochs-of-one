// batch 3 #7: birth card fields appear one by one; the pace follows the saved speed; click shows all.
import { test, expect, type Page } from '@playwright/test';

async function revealMs(page: Page, speed: number): Promise<number> {
  await page.addInitScript((sp) => { localStorage.setItem('epochs.speed.v1', String(sp)); }, speed);
  await page.goto('./');
  await page.locator('details.advanced summary').click();
  await page.locator('input[name=seed]').fill('b3-reveal');
  await page.locator('#go').click();
  await expect(page.locator('#cert')).toHaveAttribute('data-reveal', 'running', { timeout: 20000 });
  const t0 = Date.now();
  await expect(page.locator('#cert')).toHaveAttribute('data-reveal', 'done', { timeout: 20000 });
  return Date.now() - t0;
}

test('B3 staged reveal: gradual at 1×, quick at 16×', async ({ browser }) => {
  const p1 = await browser.newPage(); const slow = await revealMs(p1, 1);
  const p16 = await browser.newPage(); const fast = await revealMs(p16, 16);
  console.log(`reveal 1×: ${slow} ms · 16×: ${fast} ms`);
  expect(slow).toBeGreaterThan(3000); expect(fast).toBeLessThan(1500); expect(slow / fast).toBeGreaterThan(4);
});

test('B3 staged reveal: click shows everything at once', async ({ page }) => {
  await page.goto('./');
  await page.locator('details.advanced summary').click();
  await page.locator('input[name=seed]').fill('b3-reveal');
  await page.locator('#go').click();
  await expect(page.locator('#cert')).toHaveAttribute('data-reveal', 'running', { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/batch3/desktop-birth-reveal.png' });
  await page.locator('#cert .cert-body').click();
  await expect(page.locator('.cert .stage-hide')).toHaveCount(0);
  await expect(page.locator('#begin')).toBeVisible();
});
