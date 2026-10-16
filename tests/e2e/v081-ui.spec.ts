// v0.8.1 UI fixes: app version label (engine version in About), spend card from 15 with the invest row inside the sheet
// (no standalone first-salary prompt), toasts never over decision buttons at 390px, collapse button last on the card.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { toBirth, skipToEnd } from './auto.ts';
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

test('v081 version label: app version on home, engine only in About', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.kicker-line')).toContainText(`v${pkg.version}`);
  await expect(page.locator('#app-ver')).toHaveText(`v${pkg.version}`);
  await expect(page.locator('body')).not.toContainText('engine ');
  await page.locator('#about').click();
  await expect(page.locator('#about-ver')).toContainText(`v${pkg.version} · engine `);
});

const play = async (page: import('@playwright/test').Page, until: (age: number) => boolean, answer = true) => {
  for (let i = 0; i < 800; i++) {
    const age = Number((await page.locator('.topbar, header').first().innerText().catch(() => '')).match(/(\d+) 歲/)?.[1] ?? -1);
    if (until(age)) return age;
    const opt = page.locator('#choice:not([hidden]) button.opt').first();
    if (answer && (await opt.isVisible().catch(() => false))) await opt.click().catch(() => {}); else await page.waitForTimeout(150);
  }
  return -1;
};

test('v081 spend card only from 15; the invest option is in the sheet; no first-salary invest prompt', async ({ page }) => {
  test.setTimeout(240_000);
  await toBirth(page, 'v081-spend', { country: 'TWN', year: 1990 });
  await page.locator('#begin').click();
  await page.evaluate(() => (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement | null)?.click());
  await play(page, (a) => a >= 8);
  await expect(page.locator('#spendcard')).toBeHidden();
  const seen: string[] = [];
  for (let i = 0; i < 900; i++) {
    const txt = await page.locator('body').innerText().catch(() => '');
    const age = Number(txt.match(/(\d+) 歲/)?.[1] ?? -1);
    if (await page.locator('#nudge-title').count()) seen.push(await page.locator('#nudge-title').innerText());
    if (age >= 14) expect(age >= 15 || (await page.locator('#spendcard').isHidden())).toBe(true);
    if (age >= 22) break;
    const opt = page.locator('#choice:not([hidden]) button.opt').first();
    if (await opt.isVisible().catch(() => false)) await opt.click().catch(() => {}); else await page.waitForTimeout(150);
  }
  expect(seen.filter((x) => /投資/.test(x))).toEqual([]);
  await expect(page.locator('#spendcard')).toBeVisible();
  await page.locator('#spend').click();
  await expect(page.locator('#spend-sheet #spend-invest')).toBeVisible();
  await expect(page.locator('#spend-sheet')).toContainText('不選的話，錢就一直放在存款裡');
  // unaffordable items are greyed out with the reason instead of a buy button
  const off = page.locator('#spend-sheet .item.off').first();
  if (await off.count()) { await expect(off.locator('button[data-buy]')).toHaveCount(0); await expect(off.locator('.buy small')).not.toBeEmpty(); }
  await page.locator('#spend-sheet #spend-invest').click();
  await expect(page.locator('#panel')).toBeVisible();
});

test('v081 390px: toasts never cover the decision buttons; collapse is the last control', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await toBirth(page, 'v081-toast', { country: 'TWN', year: 1995 });
  await page.locator('#begin').click();
  await page.evaluate(() => (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement | null)?.click());
  const opt = page.locator('#choice:not([hidden]) button.opt').first();
  for (let i = 0; i < 400 && !(await opt.isVisible().catch(() => false)); i++) await page.waitForTimeout(150);
  await expect(opt).toBeVisible();
  // three stacked toasts, as after a busy year
  await page.evaluate(() => { const box = document.querySelector('#toasts')!; for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.className = 'mtoast mt-big'; d.textContent = '第一份薪水入帳了，這是一則很長的測試提示訊息'; box.appendChild(d); } });
  const toasts = await page.locator('#toasts').boundingBox();
  for (const b of await page.locator('#choice button').all()) {
    const r = await b.boundingBox(); if (!r || !toasts) continue;
    const overlap = !(r.y >= toasts.y + toasts.height || r.y + r.height <= toasts.y || r.x >= toasts.x + toasts.width || r.x + r.width <= toasts.x);
    expect(overlap, `toast covers ${await b.innerText()}`).toBe(false);
  }
  const ids = await page.locator('#choice button').evaluateAll((bs) => bs.map((b) => b.id || b.className));
  expect(ids.at(-1)).toBe('dec-min');
  expect(ids[0]).not.toBe('dec-min');
});

test('v081 happiest-year line has no empty amount and no hardship caption', async ({ page }) => {
  await toBirth(page, 'v081-hap', { country: 'TWN', year: 1960 });
  await page.locator('#begin').click();
  await skipToEnd(page);
  await expect(page.locator('#record')).toBeVisible({ timeout: 30000 });
  if (await page.locator('#happiest').count()) await expect(page.locator('#happiest')).not.toContainText('（）');
});

test('v081 auto-choice never leaves the life paused with nothing open (390px, 16×)', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await toBirth(page, 'v081-auto-stall', { country: 'USA', year: 1990 });
  await page.locator('#begin').click();
  await page.evaluate(() => { (document.querySelector('#auto') as HTMLButtonElement | null)?.click(); (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement | null)?.click(); });
  let last = -1, since = Date.now();
  while (!(await page.locator('#record, #ending').count())) {
    const a = Number((await page.locator('#age').textContent().catch(() => ''))?.replace(/\D+/g, '') || 0);
    if (a >= 40) break;
    if (a !== last) { last = a; since = Date.now(); }
    expect(Date.now() - since, `stalled at ${a}`).toBeLessThan(20_000);
    await page.waitForTimeout(300);
  }
});

test('v081 pressing resume while a decision card is open keeps the card answerable', async ({ page }) => {
  test.setTimeout(120_000);
  await toBirth(page, 'v081-resume-card', { country: 'TWN', year: 1995 });
  await page.locator('#begin').click();
  await page.evaluate(() => (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement | null)?.click());
  const opt = page.locator('#choice:not([hidden]) button.opt').first();
  await expect(opt).toBeVisible({ timeout: 60000 });
  await page.locator('#pause').click(); // the player presses 繼續 with the card still open
  await page.waitForTimeout(500);
  const h = await page.locator('#choice h2').textContent();
  await opt.click();
  await expect(page.locator('#choice h2')).not.toHaveText(h!, { timeout: 5000 }).catch(async () => { await expect(page.locator('#choice')).toBeHidden(); });
});
