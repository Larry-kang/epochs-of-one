// batch 3 #6: milestone toasts with a generated sound cue; sound toggle persists.
import { test, expect } from '@playwright/test';
import { toBirth } from './auto.ts';

test('B3 milestone toasts appear with a sound cue; sound toggle persists', async ({ page }) => {
  test.setTimeout(150000);
  await page.addInitScript(() => {   // count synthesised cues (oscillators started) without real audio
    const w = window as unknown as { OSC: number }; w.OSC = 0;
    const P = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext).prototype;
    const orig = P.createOscillator; P.createOscillator = function (this: AudioContext) { w.OSC++; return orig.call(this); };
  });
  await toBirth(page, 'b3-toast', { country: 'TWN', year: 1980 });
  await page.locator('#begin').click();
  await page.locator('#auto').evaluate((x) => (x as HTMLElement).click());
  await page.locator('.spd[data-speed="16"]').evaluate((x) => (x as HTMLElement).click());
  await expect(page.locator('#toasts .mtoast').first()).toBeVisible({ timeout: 120000 });
  await page.screenshot({ path: 'shots/batch3/desktop-milestone-toast.png' });
  expect(await page.evaluate(() => (window as unknown as { OSC: number }).OSC)).toBeGreaterThan(0);
  await page.locator('#more').click();
  const b = page.locator('#menu .sfx-t');
  await expect(b).toHaveAttribute('aria-pressed', 'true');
  await b.click(); await expect(b).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('.sfx-t').first()).toHaveAttribute('aria-pressed', 'false');
});
