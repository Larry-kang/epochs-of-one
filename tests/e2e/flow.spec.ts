import { test, expect, type Page } from '@playwright/test';
import { skipToEnd, toBirth } from './auto.ts';

const shot = (page: Page, name: string) => page.screenshot({ path: `shots/${name}.png`, fullPage: true });
const begin = (page: Page) => page.locator('#begin').click();

test('normal flow: home → roll → birth cert → life (pause / speeds up to 16×) → death', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(`http://127.0.0.1:${process.env.E2E_PORT ?? 4317}/`)) external.push(r.url()); });
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('時代');
  await expect(page.locator('#odds')).toContainText('%');
  await shot(page, '01-intro');
  await page.locator('[data-pace="30"]').click();
  await page.locator('details.advanced summary').click();
  await page.locator('input[name=seed]').fill('e2e-flow-1');
  await page.locator('#go').click();               // full roll animation (~2.5 s)
  await expect(page.locator('#begin')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#b-country')).not.toBeEmpty();
  await shot(page, '03-birth');
  await begin(page);
  await expect(page.locator('#age')).toHaveText('0 歲');
  await page.locator('.spd[data-speed="8"]').click();
  await expect(page.locator('.spd[data-speed="8"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#age')).not.toHaveText('0 歲', { timeout: 15000 });
  await page.locator('#pause').click();
  const frozen = await page.locator('#age').textContent();
  await page.waitForTimeout(3000);
  await expect(page.locator('#age')).toHaveText(frozen!);
  await page.locator('#pause').click();
  for (const s of ['1', '2', '4', '12', '16']) { await page.locator(`.spd[data-speed="${s}"]`).click(); await expect(page.locator(`.spd[data-speed="${s}"]`)).toHaveAttribute('aria-pressed', 'true'); }
  await page.keyboard.press('3');
  await expect(page.locator('.spd[data-speed="4"]')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, '04-life');
  await skipToEnd(page);
  await expect(page.getByRole('heading', { name: '人生結算' })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#died')).toContainText('享年');
  await expect(page.locator('#pct-nw')).toHaveText(/\d+%/);
  await expect(page.locator('figure.chart')).toHaveCount(2);
  await shot(page, '05-death');
  expect(external).toEqual([]);
});

test('era choice updates the born-now odds card', async ({ page }) => {
  await page.goto('./');
  const now = await page.locator('#odds').textContent();
  await page.locator('[data-era="past"]').click();
  await page.locator('#year').selectOption('1960');
  await expect.poll(() => page.locator('#odds').textContent()).not.toBe(now);
  await page.locator('#odds-all').click();
  await expect(page.getByRole('dialog')).toContainText('%');
});

test('same seed → same birth card and same death (deterministic UI)', async ({ page }) => {
  const once = async () => {
    await toBirth(page, 'golden-ui-7');
    const card = await page.locator('#b-country').textContent();
    await begin(page);
    await skipToEnd(page);
    const died = await page.locator('#died').textContent();
    const nw = await page.locator('#nw').textContent();
    return { card, died, nw };
  };
  const a = await once(), b = await once();
  expect(b).toEqual(a);
});

test('save to localStorage and continue after reload', async ({ page }) => {
  await toBirth(page, 'save-me');
  await begin(page);
  await page.locator('.spd[data-speed="8"]').click();
  await expect(page.locator('#age')).not.toHaveText('0 歲', { timeout: 15000 });
  await page.locator('#pause').click();
  const age = parseInt((await page.locator('#age').textContent())!, 10);
  expect(await page.evaluate(() => localStorage.getItem('epochs.save.v1'))).toContain('save-me');
  await page.reload();
  await page.locator('#cont').click();
  await expect(page.locator('#age')).toBeVisible();
  expect(parseInt((await page.locator('#age').textContent())!, 10)).toBeGreaterThanOrEqual(age);
});

test('skip-to-next-decision stops on a decision card with a cited fact box', async ({ page }) => {
  await toBirth(page, 'skipdec-1', { country: 'TWN', year: 1995 });
  await begin(page);
  const opt = page.locator('#choice .opt').first();
  // skipping also halts on tragic events (toast, no card) — press again until a decision appears
  for (let i = 0; i < 12 && !(await opt.isVisible()); i++) {
    await page.locator('#skip-dec').click();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 60000 });
  }
  await expect(opt).toBeVisible();
  await expect(page.locator('#choice')).toContainText('CC BY');
});

test('invalid seed lists errors and does not proceed', async ({ page }) => {
  await page.goto('./');
  await page.locator('details.advanced summary').click();
  await page.locator('input[name=seed]').fill('bad seed!');
  await page.locator('#go').click();
  await expect(page.locator('#errs li')).toHaveCount(1);
  await expect(page.locator('#go')).toBeVisible();
});

test('about page lists data sources incl. self-compiled market closes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '關於與資料來源' }).click();
  await expect(page.locator('#markets-sources')).toContainText('自行彙整');
  await expect(page.locator('main')).toContainText('CC BY 3.0 IGO');
});

test('offline: after first load the game (incl. fonts) is playable with network disabled', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const keys = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]!); return (await c.keys()).map((r) => r.url); });
  expect(keys.length).toBeGreaterThan(200);
  expect(keys.filter((u) => u.endsWith('.woff2')).length).toBe(4);
  await context.setOffline(true);
  await toBirth(page, 'offline-1', { year: 1975 });
  await begin(page);
  await skipToEnd(page);
  await expect(page.getByRole('heading', { name: '人生結算' })).toBeVisible({ timeout: 30000 });
  await context.setOffline(false);
});
