// Batch 2 (c): final-moments sequence — appears on a natural death, two-press skip, Esc, replay; real screenshots.
import { test, expect, type Page } from '@playwright/test';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';

const cfg: LifeConfig = { seed: 'b2-ending', era: { kind: 'past', year: 1950 }, nowYear: 2026, engineVersion: '0.8.0',
  constraints: { country: { kind: 'fixed', value: 'JPN' }, sex: { kind: 'fixed', value: 'F' }, quintile: { kind: 'fixed', value: 3 }, urban: { kind: 'fixed', value: true } } };
const s = runLife(loadBundleFromDisk(), cfg);
if (!('death' in s) || !s.death) throw new Error('fixture life must end');
const deathAge = s.death.age;

/** resume one year before the natural death, unpaused at 16× → the death happens live and the sequence plays */
async function nearDeath(page: Page) {
  await page.goto('./');
  await page.evaluate(([c, y]) => { localStorage.clear(); localStorage.setItem('epochs.save.v1', JSON.stringify({ v: 1, cfg: c, paceMin: 30, years: y, speed: 16, actions: [] })); localStorage.setItem('epochs.speed.v1', '16'); }, [cfg, Math.max(0, deathAge - 1)] as const);
  await page.goto('./');
  await page.locator('#cont').click();
  await expect(page.locator('#ending')).toBeVisible({ timeout: 30000 });
}

test('B2 final moments: appears, two-press skip, no share sheet after a skip', async ({ page }) => {
  await nearDeath(page);
  await page.locator('#end-skip').click();
  await expect(page.locator('#ending')).toBeVisible();                 // first press only arms
  await expect(page.locator('#end-skip')).toHaveClass(/armed/);
  await page.locator('#end-skip').click();
  await expect(page.locator('#ending')).toHaveCount(0);
  await expect(page.locator('#record')).toBeVisible();
  await expect(page.locator('#share-sheet[open]')).toHaveCount(0);
});

test('B2 final moments: Esc closes; replay button plays it again; watched to the end → share sheet', async ({ page }) => {
  await nearDeath(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#ending')).toHaveCount(0);
  await page.locator('#replay-end').click();
  await expect(page.locator('#ending')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#ending')).toHaveCount(0);
  await page.goto('./');                                               // a fresh natural death, watched through
  await nearDeath(page);
  await page.locator('#end-done').click({ timeout: 40000 });
  await expect(page.locator('#share-img')).toBeVisible();
});

for (const [vp, size] of [['desktop', { width: 1280, height: 900 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`B2 final moments screenshots (${vp})`, async ({ page }) => {
    await page.setViewportSize(size);
    await nearDeath(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `shots/batch2/${vp}-final-moments-1.png` });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `shots/batch2/${vp}-final-moments-2.png` });
    await page.locator('#end-skip').click();
    await page.screenshot({ path: `shots/batch2/${vp}-final-moments-3-armed.png` });
    await page.locator('#end-done').waitFor({ timeout: 40000 });
    await page.screenshot({ path: `shots/batch2/${vp}-final-moments-4-final.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('#ending')).toHaveCount(0);
  });
}
