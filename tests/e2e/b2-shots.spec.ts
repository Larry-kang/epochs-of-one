// Batch 2 screenshots (desktop + 390px): odds table with WPP columns, English home, focus/companions, spend sheet.
import { test, expect } from '@playwright/test';
import { toBirth } from './auto.ts';

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`B2 shots ${tag}`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize(vp);
    await page.goto('./');
    await page.locator('#odds-all').click();
    await expect(page.locator('#odds-table td.mono').nth(3)).not.toHaveText('—');
    await page.locator('#odds-table [data-k="e0"]').click();
    await page.screenshot({ path: `shots/batch2/${tag}-odds-table.png` });
    await page.locator('#tbl-close').click();
    await page.locator('.foot .lang-sel').selectOption('en');
    await page.screenshot({ path: `shots/batch2/${tag}-home-en.png`, fullPage: true });
    await page.locator('.foot .lang-sel').selectOption('zh-TW');
    await toBirth(page, `b2-shot-${tag}`, { country: 'TWN', year: 1990 });
    await page.locator('#begin').click();
    await page.evaluate(() => (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement | null)?.click());
    const dec = page.locator('#choice:not([hidden])');
    // small decisions pause time; answer them (screenshot the first) until the focus card shows at age 6
    for (let i = 0; i < 40 && !(await page.locator('#focuscard').isVisible()); i++) {
      if (await dec.count()) {
        if (i < 40) await page.screenshot({ path: `shots/batch2/${tag}-small-decision.png` });
        await dec.locator('button.opt').first().click();
      }
      await page.waitForTimeout(1000);
    }
    await expect(page.locator('#focuscard')).toBeVisible();
    if (await dec.count()) await dec.locator('button.opt').first().click();
    await page.locator('#pause').click();
    await page.locator('.fpill[data-focus="study"]').click();
    await page.screenshot({ path: `shots/batch2/${tag}-focus-companions.png`, fullPage: true });
    await page.locator('#spend').click();
    await expect(page.locator('#spend-sheet')).toBeVisible();
    await page.screenshot({ path: `shots/batch2/${tag}-spend-sheet.png` });
  });
}
