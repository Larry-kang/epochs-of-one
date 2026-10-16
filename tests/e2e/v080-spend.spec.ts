// v0.8.0 SPEND (v0.8.1: card hidden before 15): "花錢·投資" entry from 15 under the ID card / focus area; tabs merge spend, invest/house/loan/annuity
// and habits; situation-sorted list; buy, then sell an owned item; lifestyle setting persists.
import { test, expect, type Page } from '@playwright/test';
import { toBirth } from './auto.ts';

async function playTo(page: Page, age: number): Promise<void> {
  for (let i = 0; i < 1200; i++) {
    const a = Number((await page.locator('#age').textContent())?.replace(/\D+/g, '') || 0);
    if (a >= age) break;
    const opt = page.locator('#choice:not([hidden]) button.opt, dialog[open] button.opt').first();
    if (await opt.isVisible().catch(() => false)) await opt.click().catch(() => {}); else await page.waitForTimeout(200);
  }
  await page.evaluate(() => (document.querySelector('#pause') as HTMLButtonElement).click());
}

for (const [name, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`v080 spend · invest (${name})`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(vp);
    await toBirth(page, `v080-spend-${name}`, { country: 'TWN', year: 1990 });
    await page.locator('#begin').click();
    await page.evaluate(() => (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement | null)?.click());
    await playTo(page, 10);
    await expect(page.locator('#spendcard')).toBeHidden(); // v0.8.1: nothing before 15
    await page.evaluate(() => (document.querySelector('#pause') as HTMLButtonElement).click());
    await playTo(page, 16);
    await expect(page.locator('#spend')).toContainText('花錢·投資');
    await expect(page.locator('#fin-btns')).toBeVisible();
    // the entry sits below the focus card (and below the ID card at 390px)
    const fy = (await page.locator('#focuscard').boundingBox())!.y, sy = (await page.locator('#spendcard').boundingBox())!.y;
    expect(sy).toBeGreaterThan(fy);
    if (name === 'm390') expect(sy).toBeGreaterThan((await page.locator('#idcard').boundingBox())!.y);
    await page.locator('#spendcard').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `shots/v080/spend-entry-${name}.png` });
    await page.locator('#spend').click();
    const sh = page.locator('#spend-sheet');
    await expect(sh.locator('[role="tab"]')).toHaveCount(3);
    await expect(sh.locator('#spend-list li').first()).toBeVisible();
    await page.screenshot({ path: `shots/v080/spend-sheet-${name}.png` });
    // fun items always sort after the rest
    const tags = await sh.locator('#spend-list .cat').evaluateAll((els) => els.map((e) => [...e.classList].find((c) => c.startsWith('cat-'))));
    const f = tags.indexOf('cat-fun'); if (f >= 0) expect(tags.slice(f).every((c) => c === 'cat-fun')).toBe(true);
    // buy a cheap owned item if possible, then sell it
    const phone = sh.locator('[data-buy="phone"]');
    if (await phone.count()) {
      await phone.click();
      await sh.locator('#spend-more summary').click();
      await expect(sh.locator('[data-sell="phone"]')).toHaveCount(1);
      await sh.locator('[data-sell="phone"]').click();
      await expect(sh.locator('[data-sell="phone"]')).toHaveCount(0);
    }
    await sh.locator('[data-tab="habits"]').click();
    await sh.locator('[data-ls="diet"][data-v="healthy"]').click();
    await expect(sh.locator('[data-ls="diet"][data-v="healthy"]')).toHaveAttribute('aria-checked', 'true');
    await page.screenshot({ path: `shots/v080/spend-habits-${name}.png` });
    await sh.locator('[data-tab="fin"]').click();
    await sh.locator('[data-fin="invest"]').click();
    await expect(page.locator('#panel')).toBeVisible();
  });
}
