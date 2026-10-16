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
