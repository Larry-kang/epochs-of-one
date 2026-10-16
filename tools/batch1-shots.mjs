// Batch 1 screenshots (desktop 1280 + 390 px) → shots/batch1/. Needs `vite preview --port 4317` (or E2E_PORT).
import { chromium } from '@playwright/test';
const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 4317}/`;
const C = (iso) => ({ country: { kind: 'fixed', value: iso }, sex: { kind: 'fixed', value: 'F' }, quintile: { kind: 'fixed', value: 3 }, urban: { kind: 'fixed', value: true } });
const save = (seed, year, years, constraints) => ({ v: 1, cfg: { seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: '0.6.0', constraints }, paceMin: 60, years, speed: 1, actions: [] });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const [vp, size] of [['desktop', { width: 1280, height: 900 }], ['m390', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: size, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const shot = (n, full = true) => page.screenshot({ path: `shots/batch1/${vp}-${n}.png`, fullPage: full });
  const resume = async (sv) => {
    await page.goto(BASE); await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('epochs.save.v1', JSON.stringify(s)); }, sv);
    await page.goto(BASE); await page.locator('#cont').click(); await page.locator('#age').waitFor();
  };
  await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.goto(BASE);
  await page.waitForTimeout(600); await shot('01-home');
  await page.locator('[data-era="past"]').click(); await page.locator('#year').selectOption('1970'); await page.waitForTimeout(200); await shot('02-home-past-1970');
  await page.locator('#odds-all').click(); await page.waitForTimeout(200); await shot('03-odds-table', false); await page.keyboard.press('Escape');
  await page.locator('summary').click(); await page.locator('#country').selectOption('TWN'); await page.locator('input[name=seed]').fill('batch1tw');
  await page.locator('#go').click(); await page.waitForTimeout(900); await shot('04-roll', false);
  await page.locator('#cert').waitFor({ timeout: 10000 }); await page.waitForTimeout(400); await shot('05-birth-cert');
  await resume(save('b1play', 1985, 33, C('TWN')));
  await page.getByRole('button', { name: '暫停' }).click(); await page.waitForTimeout(300); await shot('06-play', false);
  await shot('06b-play-full');
  // a decision: TWN girl at 17 → career/uni offers around 18
  await resume(save('b1dec', 1995, 17, C('TWN')));
  await page.locator('#skip-dec').click().catch(() => {}); await page.locator('#choice .opt').first().waitFor({ timeout: 60000 }).catch(() => {}); await page.waitForTimeout(300); await shot('07-decision', false);
  await page.locator('#auto').click().catch(() => {}); await page.locator('#auto-now').click().catch(() => {}); await page.waitForTimeout(800); await shot('08-decision-auto', false);
  await resume(save('b1play', 1985, 33, C('TWN')));
  await page.getByRole('button', { name: '暫停' }).click();
  await page.locator('#more').click(); await page.locator('#skip').click(); await page.waitForTimeout(3800); await shot('09-final-moments', false);
  await page.keyboard.press('Escape'); await page.locator('#share-sheet #sh-close').click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(300); await shot('10-death-record');
  await page.locator('#share-open').click(); await page.waitForTimeout(400); await shot('11-share-sheet', false);
  await ctx.close();
}
await browser.close();
