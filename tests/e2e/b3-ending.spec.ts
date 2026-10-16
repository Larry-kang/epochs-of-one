// batch 3 #1: ending sequence — life replay (portrait ages through key moments), then the "lived N years" card.
import { test, expect } from '@playwright/test';
import { toBirth } from './auto.ts';

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`B3 ending replay then lived-N-years card (${tag})`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(vp);
    await toBirth(page, 'b3-ending', { country: 'TWN', year: 1950 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#begin').click();
    await page.locator('#more').click(); await page.locator('#skip').click();    // fast-forward also gets the ending
    await expect(page.locator('#ending')).toBeVisible();
    await expect(page.locator('#end-lived')).toBeHidden();
    await expect(page.locator('#end-cap')).not.toBeEmpty({ timeout: 5000 });
    const first = await page.locator('#end-scene').innerHTML();
    await page.screenshot({ path: `shots/batch3/${tag}-ending-replay.png` });
    await expect.poll(() => page.locator('#end-scene').innerHTML(), { timeout: 8000 }).not.toBe(first);   // the portrait ages
    await expect(page.locator('#end-lived')).toBeVisible({ timeout: 30000 });
    const age = (await page.locator('#end-cap').textContent())!.match(/\d+/)![0];
    await expect(page.locator('#end-lived b')).toHaveText(age);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `shots/batch3/${tag}-ending-lived.png` });
    await page.locator('#end-done').click();
    await expect(page.locator('#ending')).toHaveCount(0);
  });
}
