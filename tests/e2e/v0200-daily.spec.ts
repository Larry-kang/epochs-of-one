// v0.20.0 (item 5 P1, A1): daily theme — one fixed seed per UTC day, birth year skips crisis years.
import { test, expect, type Page } from '@playwright/test';

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
async function home(page: Page, iso: string, lang = 'zh-TW'): Promise<void> {
  await page.clock.setFixedTime(new Date(iso));
  await page.addInitScript((l) => localStorage.setItem('epochs.lang.v1', l), lang);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await page.locator('#daily').waitFor();
}

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`daily card starts the day's fixed-seed life (${tag})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await home(page, '2026-11-21T12:00:00Z');
    const card = page.locator('#daily');
    await expect(card).toContainText('2026-11-21');
    const year = await card.getAttribute('data-year');
    expect(Number(year)).toBeGreaterThanOrEqual(1950);
    expect(await card.getAttribute('data-seed')).toBe('daily-20261121');
    await expect(card).toContainText(String(year));
    expect(await noOverflow(page)).toBe(true);
    await page.locator('#daily-go').click();
    await page.locator('#begin').waitFor();
    await expect(page.locator('#seed')).toHaveText('daily-20261121');
    await expect(page.locator('.story')).toContainText(String(year));
    expect(await noOverflow(page)).toBe(true);
  });
}

test('same day → same theme; next UTC day → new seed', async ({ browser }) => {
  const a = await browser.newPage(); await home(a, '2026-11-21T01:00:00Z');
  const b = await browser.newPage(); await home(b, '2026-11-21T23:00:00Z');
  expect(await a.locator('#daily').getAttribute('data-year')).toBe(await b.locator('#daily').getAttribute('data-year'));
  const c = await browser.newPage(); await home(c, '2026-11-22T00:30:00Z');
  expect(await c.locator('#daily').getAttribute('data-seed')).toBe('daily-20261122');
});

for (const [lang, word] of [['en', 'Today'], ['ja', '今日'], ['ko', '오늘'], ['zh-TW', '今日']] as const) {
  test(`daily card is translated (${lang})`, async ({ page }) => {
    await home(page, '2026-11-21T12:00:00Z', lang);
    await expect(page.locator('#daily h2')).toContainText(word);
    await expect(page.locator('#daily-go')).not.toBeEmpty();
  });
}

test('About cites the crisis list the daily theme avoids', async ({ page }) => {
  await home(page, '2026-11-21T12:00:00Z');
  await page.locator('#about').click();
  await expect(page.locator('#daily-source')).toContainText('2026-11-21');
  await expect(page.locator('#daily-source')).toContainText('Wikipedia');
});
