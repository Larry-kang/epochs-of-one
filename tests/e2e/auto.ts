import type { Page } from '@playwright/test';
/** Auto-answer P01 life-choice cards (first option) and dismiss finance nudges, so long-running flows don't stall.
 *  Tests that exercise the cards themselves simply don't install it. */
export async function autoAnswer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    setInterval(() => {
      const box = document.querySelector('#choice') as HTMLElement | null;
      if (!box || box.hidden) return;
      (box.querySelector('#nudge-later, .opt') as HTMLElement | null)?.click();
    }, 150);
  });
}

/** "Skip to the end" lives in the top-bar overflow menu since batch 1. */
export async function skipToEnd(page: Page): Promise<void> {
  await page.locator('#more').click();
  await page.locator('#skip').click();
  // batch 3: skipping now plays the ending sequence too; close it to reach the record
  await page.locator('#ending').waitFor({ timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.locator('#ending').waitFor({ state: 'detached' });
}

/** Home → (advanced: country/seed) → roll → birth certificate. Reduced motion skips the roll animation. */
export async function toBirth(page: Page, seed: string, o: { pace?: 30 | 60 | 90; country?: string; year?: number } = {}): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  if (o.year) { await page.locator('[data-era="past"]').click(); await page.locator('#year').selectOption(String(o.year)); }
  await page.locator(`[data-pace="${o.pace ?? 30}"]`).click();
  await page.locator('details.advanced summary').click();
  if (o.country) await page.locator('#country').selectOption(o.country);
  await page.locator('input[name=seed]').fill(seed);
  await page.locator('#go').click();
  await page.locator('#begin').waitFor();
}
