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

/** v0.8.1: the spend·invest card only exists from 15 — run the life (answering cards) to `age`, then pause */
export async function playToAge(page: Page, age: number): Promise<void> {
  const paused = async () => (await page.locator('#pause').getAttribute('aria-pressed')) === 'true' || /繼續|Resume/.test(await page.locator('#pause').innerText());
  await page.evaluate(() => (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement | null)?.click());
  let last = -1, since = Date.now();
  for (let i = 0; i < 1500; i++) {
    const a = Number((await page.locator('#age').textContent())?.replace(/\D+/g, '') || 0);
    if (a >= age) break;
    if (a !== last) { last = a; since = Date.now(); }
    else if (Date.now() - since > 4000) { // stalled (a sheet, a minimised card or a tragic-event pause): close it and resume
      since = Date.now(); await page.keyboard.press('Escape').catch(() => {});
      if (await page.locator('#restore-bar:not([hidden])').count()) await page.locator('#restore-bar button').first().click().catch(() => {});
      await page.evaluate(() => { const b = document.querySelector('#pause') as HTMLButtonElement | null; if (b && /繼續|Resume|続け|계속|Tiếp/.test(b.textContent ?? '')) b.click(); });
    }
    const opt = page.locator('#choice:not([hidden]) button.opt, dialog[open] button.opt').first();
    if (await opt.isVisible().catch(() => false)) { await opt.click().catch(() => {}); continue; }
    if (await page.locator('#panel:not([hidden])').count()) await page.keyboard.press('Escape');
    if (await paused()) await page.locator('#pause').click().catch(() => {});
    await page.waitForTimeout(200);
  }
  if (!(await paused())) await page.evaluate(() => (document.querySelector('#pause') as HTMLButtonElement).click());
}
