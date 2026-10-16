// batch 3 #3: scene banner for era and place, updates as the life moves on.
import { test, expect } from '@playwright/test';
import { toBirth } from './auto.ts';

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`B3 scene banner (${tag})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await toBirth(page, 'b3-scene', { country: 'TWN', year: 1955 });
    await page.locator('#begin').click();
    const b = page.locator('#scene');
    await expect(b.locator('svg')).toBeVisible();
    await expect(b).toHaveAttribute('data-era', 'postwar');
    await expect(b.locator('.scene-label')).toContainText('台灣');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `shots/batch3/${tag}-scene-banner.png`, clip: { x: 0, y: 0, width: vp.width, height: 200 } });
    await page.locator('.spd[data-speed="16"]').evaluate((x) => (x as HTMLElement).click());
    await page.locator('#auto').evaluate((x) => (x as HTMLElement).click());
    await expect(b.locator('#scene-year')).not.toHaveText('1955');
  });
}
