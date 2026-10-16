// Before/after screenshot capture for the P0+P1 revamp (desktop 1280 and mobile 390).
// Usage: node tools/p01-shots.mjs <tag>   (needs `vite preview --port 4317` or E2E_PORT)
import { chromium } from '@playwright/test';
const tag = process.argv[2] ?? 'after';
const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 4317}/`;
const C = (iso) => ({ country: { kind: 'fixed', value: iso }, sex: { kind: 'random' }, quintile: { kind: 'fixed', value: 3 }, urban: { kind: 'random' } });
const save = (seed, year, years, constraints, actions = []) => ({ v: 1, cfg: { seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 'x', constraints }, paceMin: 30, years, speed: 8, actions });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const [vp, size] of [['desktop', { width: 1280, height: 900 }], ['m390', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: size, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: `shots/p01-${tag}-${vp}-${n}.png`, fullPage: true });
  const resume = async (sv) => {
    await page.goto(BASE); await page.evaluate((s) => localStorage.setItem('epochs.save.v1', JSON.stringify(s)), sv);
    await page.goto(BASE); await page.getByRole('button', { name: '繼續上次的人生' }).click();
    await page.locator('#age').waitFor();
    const p = page.getByRole('button', { name: '暫停' }); if (await p.count()) await p.click();
    const card = page.locator('#choice'); if (await card.count()) await page.waitForTimeout(200);
  };
  await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.goto(BASE);
  await shot('01-intro');
  await page.getByRole('button', { name: '開始' }).first().click().catch(() => {});
  await page.waitForTimeout(300); await shot('02-setup');
  await resume(save('p01tw', 1980, 45, C('TWN'))); await page.waitForTimeout(300); await shot('03-life-twn-45');
  await page.getByRole('button', { name: '買房／賣房' }).click().catch(() => {}); await page.waitForTimeout(300); await shot('04-house-twn');
  await resume(save('p01in', 1985, 30, C('IND'))); await page.getByRole('button', { name: '信貸' }).click().catch(() => {}); await page.waitForTimeout(300); await shot('05-loan-ind');
  await resume(save('p01tw', 1980, 45, C('TWN')));
  await page.getByRole('button', { name: '快轉到終點' }).click(); await page.getByRole('heading', { name: '人生結算' }).waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(500); await shot('06-death-twn');
  await ctx.close();
}
await browser.close();
