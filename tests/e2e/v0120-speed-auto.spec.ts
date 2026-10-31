// v0.12.0: speed and auto controls always visible on mobile (390px), speed persists after decisions
import { test, expect, type Page } from '@playwright/test';
import { toBirth } from './auto.ts';

test.describe.configure({ timeout: 180_000 });

async function setSpeed(page: Page, speed: number): Promise<void> {
  // Click the cycle button until desired speed is reached
  const currentText = await page.locator('#spd-cycle').innerText();
  const currentSpeed = parseInt(currentText.replace('×', ''), 10);
  const speeds = [1, 2, 4, 8, 12, 16];
  const currentIdx = speeds.indexOf(currentSpeed);
  const targetIdx = speeds.indexOf(speed);
  if (currentIdx === -1 || targetIdx === -1) throw new Error(`Invalid speed: ${speed}`);
  const clicks = (targetIdx - currentIdx + speeds.length) % speeds.length;
  for (let i = 0; i < clicks; i++) {
    await page.locator('#spd-cycle').click();
    await page.waitForTimeout(50);
  }
}

async function getSpeed(page: Page): Promise<number> {
  const text = await page.locator('#spd-cycle').innerText();
  return parseInt(text.replace('×', ''), 10);
}

async function getAutoState(page: Page): Promise<boolean> {
  return (await page.locator('#auto').getAttribute('aria-pressed')) === 'true';
}

async function waitForDecisionAndAccept(page: Page, maxWaitMs = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const choice = page.locator('#choice:not([hidden])');
    if (await choice.count() > 0) {
      // Wait for auto to make the decision (or click first option if not auto)
      const opt = choice.locator('button.opt').first();
      if (await opt.isVisible().catch(() => false)) {
        await opt.click().catch(() => {});
        await page.waitForTimeout(200);
        return;
      }
    }
    await page.waitForTimeout(200);
  }
  throw new Error('Decision did not appear in time');
}

test('v0.12.0 at 390px width: speed and auto controls are visible with >=44px tap targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await toBirth(page, 'v0120-mobile-visibility', { pace: 60, country: 'TWN', year: 1990 });
  await page.locator('#begin').click();
  await expect(page.locator('#topbar')).toBeVisible();

  // Speed cycle button should be visible
  const spdCycle = page.locator('#spd-cycle');
  await expect(spdCycle).toBeVisible();
  const spdCycleBox = await spdCycle.boundingBox();
  expect(spdCycleBox).not.toBeNull();
  expect(spdCycleBox!.width).toBeGreaterThanOrEqual(44);
  expect(spdCycleBox!.height).toBeGreaterThanOrEqual(44);

  // Auto button should be visible
  const autoBtn = page.locator('#auto');
  await expect(autoBtn).toBeVisible();
  const autoBox = await autoBtn.boundingBox();
  expect(autoBox).not.toBeNull();
  expect(autoBox!.width).toBeGreaterThanOrEqual(44);
  expect(autoBox!.height).toBeGreaterThanOrEqual(44);

  // Full speed buttons (.tb-speeds) and skip-dec should be hidden on mobile
  await expect(page.locator('.tb-speeds')).toBeHidden();
  await expect(page.locator('#skip-dec')).toBeHidden();

  // Compact container should be visible
  await expect(page.locator('.tb-compact')).toBeVisible();
});

test('v0.12.0 at 390px width: chosen speed persists after completing a decision', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await toBirth(page, 'v0120-speed-persist-mobile', { pace: 60, country: 'TWN', year: 1990 });
  await page.locator('#begin').click();

  // Keep auto off so the test reaches and closes the decision card manually.
  if (await getAutoState(page)) await page.locator('#auto').click();
  await expect(page.locator('#auto')).toHaveAttribute('aria-pressed', 'false');

  // Set speed to 16× so the first decision arrives within the wait window
  await setSpeed(page, 16);
  await expect(page.locator('#spd-cycle')).toHaveText('16×');
  const speedBefore = await getSpeed(page);
  expect(speedBefore).toBe(16);

  // Wait for the first decision (around age 15-18) and choose manually.
  await waitForDecisionAndAccept(page);

  // Speed should still be 16×
  const speedAfter = await getSpeed(page);
  expect(speedAfter).toBe(16);
});

test('v0.12.0 desktop: chosen speed persists after completing a decision', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await toBirth(page, 'v0120-speed-persist-desktop', { pace: 60, country: 'TWN', year: 1990 });
  await page.locator('#begin').click();

  // Keep auto off so the test reaches and closes the decision card manually.
  if (await getAutoState(page)) await page.locator('#auto').click();
  await expect(page.locator('#auto')).toHaveAttribute('aria-pressed', 'false');

  // Set speed to 8× using desktop speed buttons
  await page.locator('.spd[data-speed="8"]').click();
  await expect(page.locator('#spd-cycle')).toHaveText('8×');
  const speedBefore = await getSpeed(page);
  expect(speedBefore).toBe(8);

  // Wait for the first decision and choose manually.
  await waitForDecisionAndAccept(page);

  // Speed should still be 8×
  const speedAfter = await getSpeed(page);
  expect(speedAfter).toBe(8);
});

test('v0.12.0 at 390px width: auto toggle works and persists', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await toBirth(page, 'v0120-auto-toggle', { pace: 60, country: 'TWN', year: 1990 });
  await page.locator('#begin').click();

  // Auto should be off by default
  await expect(page.locator('#auto')).toHaveAttribute('aria-pressed', 'false');

  // Toggle auto on
  await page.locator('#auto').click();
  await expect(page.locator('#auto')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#auto-m')).toHaveAttribute('aria-pressed', 'true');

  // Toggle auto off
  await page.locator('#auto').click();
  await expect(page.locator('#auto')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#auto-m')).toHaveAttribute('aria-pressed', 'false');
});

test('v0.12.0 speed cycle button cycles through all speeds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await toBirth(page, 'v0120-speed-cycle', { pace: 60, country: 'TWN', year: 1990 });
  await page.locator('#begin').click();

  const speeds = [1, 2, 4, 8, 12, 16];
  for (const speed of speeds) {
    await expect(page.locator('#spd-cycle')).toHaveText(`${speed}×`);
    await page.locator('#spd-cycle').click();
    await page.waitForTimeout(50);
  }
  // Should cycle back to 1
  await expect(page.locator('#spd-cycle')).toHaveText('1×');
});
