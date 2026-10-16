// C0 core careers: occupation on the ID card (+推估 chip), occupation names in the log and on decision cards,
// career switch and startup decisions, and illicit work refused under auto-choice. Screenshots → shots/c0/.
import { test, expect, type Page } from '@playwright/test';
import { toBirth } from './auto.ts';

test.describe.configure({ timeout: 300_000 });
const VPS = [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const;
const fast = (page: Page) => page.evaluate(() => (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement | null)?.click());
/** answer every other card with its first option until the card `id` shows (or the life ends) */
async function until(page: Page, id: string, max = 600): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    const box = page.locator('#choice:not([hidden])');
    if (await box.isVisible().catch(() => false)) {
      if ((await box.getAttribute('data-id').catch(() => null)) === id) return true;
      await box.locator('#nudge-later, button.opt').first().click().catch(() => {});
    } else if (await page.locator('.death-page, #ending').first().isVisible().catch(() => false)) return false;
    else await page.waitForTimeout(150);
  }
  return false;
}
/** answer any open card with its first option until `sel` is visible (the choice applies when the year resolves) */
async function answerUntil(page: Page, sel: string, max = 300): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await page.locator(sel).first().isVisible().catch(() => false)) return;
    const box = page.locator('#choice:not([hidden])');
    if (await box.isVisible().catch(() => false)) await box.locator('#nudge-later, button.opt').first().click().catch(() => {});
    else await page.waitForTimeout(150);
  }
}
const pause = (page: Page) => page.evaluate(() => (document.querySelector('#pause') as HTMLButtonElement).click());

for (const [name, vp] of VPS) {
  test(`C0 career switch + ID card (${name})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await toBirth(page, 'c0e-TWN-4', { country: 'TWN', year: 1990 });
    await page.locator('#begin').click(); await fast(page);
    expect(await until(page, 'career')).toBe(true);
    // career card options are occupation names, never raw ids
    const labels = await page.locator('#choice button.opt b').allTextContents();
    expect(labels.length).toBeGreaterThanOrEqual(2);
    for (const l of labels) expect(l).not.toMatch(/^[a-z_]+$/);
    await page.screenshot({ path: `shots/c0/career-card-${name}.png` });
    await page.locator('#choice button.opt').first().click();
    await answerUntil(page, '#id-job');
    await expect(page.locator('#id-job')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#log')).toContainText('第一份工作', { timeout: 30000 });
    expect(await until(page, 'switch')).toBe(true);
    await expect(page.locator('#choice-title')).toContainText('轉換跑道');
    await page.screenshot({ path: `shots/c0/switch-card-${name}.png` });
    const before = await page.locator('#id-job').getAttribute('data-occ');
    await page.locator('#choice button.opt').nth(1).click();
    await answerUntil(page, '#log :text("轉換跑道")');
    await expect(page.locator('#log')).toContainText('轉換跑道', { timeout: 30000 });
    await expect(page.locator('#id-job')).not.toHaveAttribute('data-occ', before!, { timeout: 30000 });
    await pause(page);
    await page.locator('#idcard').scrollIntoViewIfNeeded();
    const chip = page.locator('#idcard .occ-est');
    if (await chip.count()) await expect(chip).toHaveAttribute('title', /ILOSTAT/);
    await page.screenshot({ path: `shots/c0/idcard-${name}.png` });
  });

  test(`C0 startup decision (${name})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await toBirth(page, 'c0e-TWN-397', { country: 'TWN', year: 1990 });
    await page.locator('#begin').click(); await fast(page);
    expect(await until(page, 'startup')).toBe(true);
    await expect(page.locator('#choice-title')).toContainText('創業');
    const labels = await page.locator('#choice button.opt b').allTextContents();
    for (const l of labels) expect(l).not.toMatch(/^[a-z_]+$/);
    await page.screenshot({ path: `shots/c0/startup-card-${name}.png` });
    await page.locator('#choice button.opt').nth(1).click();
    await expect(page.locator('#log .ev').first()).toBeVisible();
  });
}

test('C0 illicit work is refused under auto-choice', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await toBirth(page, 'c0e-TWN-368', { country: 'TWN', year: 1990 });
  await page.locator('#begin').click(); await fast(page);
  // turn on auto-choice from the first card; from then on nothing is clicked by the test
  await page.locator('#choice:not([hidden]) #auto-now').click({ timeout: 60000 });
  let saw = false;
  for (let i = 0; i < 900 && !saw; i++) {
    const box = page.locator('#choice:not([hidden])');
    if ((await box.getAttribute('data-id').catch(() => null)) === 'illicit') {
      saw = true;
      await expect(box).toHaveAttribute('data-def', 'refuse');
      await expect(box.locator('button.opt.pre')).toHaveAttribute('data-opt', 'refuse');
      await page.screenshot({ path: 'shots/c0/illicit-auto-desktop.png' });
    } else if (await page.locator('.death-page, #ending').first().isVisible().catch(() => false)) break;
    else await page.waitForTimeout(100);
  }
  expect(saw).toBe(true);
  await expect(page.locator('#log')).toContainText('你拒絕了', { timeout: 30000 });
  await expect(page.locator('#log')).not.toContainText('你答應');
});
