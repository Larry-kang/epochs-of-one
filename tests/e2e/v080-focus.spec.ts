// v0.8.0 yearly focus chips per stage; v0.8.1 single-select (exactly one chip, picking another replaces it), clear.
import { test, expect } from '@playwright/test';
import { toBirth } from './auto.ts';

for (const [name, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`v080 focus chips (${name})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await toBirth(page, `v080-focus-${name}`, { country: 'TWN', year: 1990 });
    await page.locator('#begin').click();
    await page.evaluate(() => (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement | null)?.click());
    for (let i = 0; i < 240 && !(await page.locator('#focuscard').isVisible()); i++) {
      const opt = page.locator('#choice:not([hidden]) button.opt, dialog[open] button.opt').first();
      if (await opt.isVisible().catch(() => false)) await opt.click().catch(() => {}); else await page.waitForTimeout(250);
    }
    await expect(page.locator('#focuscard')).toBeVisible();
    await page.evaluate(() => (document.querySelector('#pause') as HTMLButtonElement).click());
    const chips = page.locator('#focus-pills .fpill[data-focus]:not([data-focus=""])');
    expect(await chips.count()).toBeGreaterThanOrEqual(5);
    await page.locator('.fpill[data-focus="study"]').click();
    await expect(page.locator('.fpill[data-focus="study"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('.fpill[data-focus="study"]').click(); // tapping the active chip keeps it
    await expect(page.locator('.fpill[data-focus="study"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('.fpill[data-focus="play"]').click(); // picking another replaces it
    await expect(page.locator('.fpill[data-focus="play"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#focus-pills .fpill[data-focus]:not([data-focus=""])[aria-checked="true"]')).toHaveCount(1);
    await page.locator('.fpill[data-focus="study"]').click();
    await expect(page.locator('#focus-pills .fpill[data-focus]:not([data-focus=""])[aria-checked="true"]')).toHaveCount(1);
    await expect(page.locator('.fpill[data-focus="study"]')).toHaveAttribute('aria-checked', 'true');
    // v0.8.1: after a year with this focus, a feedback line explains its effects
    await page.evaluate(() => (document.querySelector('#pause') as HTMLButtonElement).click());
    for (let i = 0; i < 150 && !(await page.locator('#fc-feedback').isVisible()); i++) {
      const opt = page.locator('#choice:not([hidden]) button.opt, dialog[open] button.opt').first();
      if (await opt.isVisible().catch(() => false)) await opt.click().catch(() => {}); else await page.waitForTimeout(200);
    }
    await expect(page.locator('#fc-feedback')).toBeVisible();
    await expect(page.locator('#fc-feedback')).toContainText('升學機會');
    await page.evaluate(() => (document.querySelector('#pause') as HTMLButtonElement).click());
    await page.locator('#focuscard').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `shots/v080/focus-${name}.png` });
    await page.locator('.fpill.clear').click();
    await expect(page.locator('.fpill[data-focus="study"]')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#focus-pills .fpill[data-focus]:not([data-focus=""])[aria-checked="true"]')).toHaveCount(0);
  });
}
