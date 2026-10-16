// batch 3 #2: death-page epilogue sections.
import { test, expect } from '@playwright/test';
import { toBirth, skipToEnd } from './auto.ts';

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`B3 death page: see-off, hobbies, visited, same-second five, memorable, full log (${tag})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await toBirth(page, 'b3-death', { country: 'TWN', year: 1950 });
    await page.locator('#begin').click();
    await skipToEnd(page);
    const ep = page.locator('#epilogue');
    await expect(ep).toBeVisible();
    for (const id of ['#dp-seeoff', '#dp-hobbies', '#dp-visited', '#dp-mem']) await expect(ep.locator(id)).toBeVisible();
    await expect(page.locator('#dp-hobbies li').first()).toBeVisible();
    await expect(page.locator('#dp-peers li')).toHaveCount(5, { timeout: 20000 });
    await page.locator('#dp-log summary').click();
    expect(await page.locator('#dp-log .yr').count()).toBeGreaterThan(10);
    await ep.scrollIntoViewIfNeeded();
    await ep.screenshot({ path: `shots/batch3/${tag}-death-epilogue.png` });
  });
}
