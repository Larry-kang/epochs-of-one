import { test, expect, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `shots/${name}.png`, fullPage: true });

async function toBirth(page: Page, seed: string, pace = '30') {
  await page.goto('./');
  await page.getByRole('button', { name: '開始新的人生' }).click();
  await page.locator(`input[name=pace][value="${pace}"]`).check();
  await page.locator('input[name=seed]').fill(seed);
  await page.getByRole('button', { name: '抽出生卡' }).click();
  await expect(page.getByRole('heading', { name: '你出生了' })).toBeVisible();
}

test('normal flow: intro → setup → birth → life (pause / speed) → death', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(`http://127.0.0.1:${process.env.E2E_PORT ?? 4317}/`)) external.push(r.url()); });
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('時代人生');
  await shot(page, '01-intro');
  await page.getByRole('button', { name: '開始新的人生' }).click();
  await shot(page, '02-setup');
  await page.locator('input[name=pace][value="30"]').check();
  await page.locator('input[name=seed]').fill('e2e-flow-1');
  await page.getByRole('button', { name: '抽出生卡' }).click();
  await expect(page.locator('#b-country')).not.toBeEmpty();
  await shot(page, '03-birth');
  await page.getByRole('button', { name: '開始過日子' }).click();
  await expect(page.locator('#age')).toHaveText('0 歲');
  await page.locator('.spd[data-speed="8"]').click();
  await expect(page.locator('.spd[data-speed="8"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#age')).not.toHaveText('0 歲', { timeout: 15000 });
  // pause: age must not change
  await page.getByRole('button', { name: '暫停' }).click();
  const frozen = await page.locator('#age').textContent();
  await page.waitForTimeout(3500);
  await expect(page.locator('#age')).toHaveText(frozen!);
  await page.getByRole('button', { name: '繼續' }).click();
  for (const s of ['1', '2', '4']) { await page.locator(`.spd[data-speed="${s}"]`).click(); await expect(page.locator(`.spd[data-speed="${s}"]`)).toHaveAttribute('aria-pressed', 'true'); }
  await shot(page, '04-life');
  await page.getByRole('button', { name: '快轉到終點' }).click();
  await expect(page.getByRole('heading', { name: '人生結算' })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#died')).toContainText('享年');
  await expect(page.locator('#pct-nw')).toHaveText(/\d+%/);
  await expect(page.locator('figure.chart')).toHaveCount(2);
  await shot(page, '05-death');
  expect(external).toEqual([]);
});

test('same seed → same birth card and same death (deterministic UI)', async ({ page }) => {
  const once = async () => {
    await toBirth(page, 'golden-ui-7');
    const card = await page.locator('.facts').textContent();
    await page.getByRole('button', { name: '開始過日子' }).click();
    await page.getByRole('button', { name: '快轉到終點' }).click();
    const died = await page.locator('#died').textContent();
    const nw = await page.locator('#nw').textContent();
    return { card, died, nw };
  };
  const a = await once(), b = await once();
  expect(b).toEqual(a);
});

test('save to localStorage and continue after reload', async ({ page }) => {
  await toBirth(page, 'save-me', '30');
  await page.getByRole('button', { name: '開始過日子' }).click();
  await page.locator('.spd[data-speed="8"]').click();
  await expect(page.locator('#age')).not.toHaveText('0 歲', { timeout: 15000 });
  await page.getByRole('button', { name: '暫停' }).click();
  const age = parseInt((await page.locator('#age').textContent())!, 10);
  const saved = await page.evaluate(() => localStorage.getItem('epochs.save.v1'));
  expect(saved).toContain('save-me');
  await page.reload();
  await page.getByRole('button', { name: '繼續上次的人生' }).click();
  await expect(page.locator('#age')).toBeVisible();
  const age2 = parseInt((await page.locator('#age').textContent())!, 10);
  expect(age2).toBeGreaterThanOrEqual(age);
});

test('setup validation lists errors and does not proceed', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始新的人生' }).click();
  await page.locator('input[name=era][value="past-year"]').check();
  await page.locator('input[name=year]').fill('1800');
  await page.locator('input[name=seed]').fill('bad seed!');
  await page.getByRole('button', { name: '抽出生卡' }).click();
  await expect(page.locator('#errs li')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: '出生設定' })).toBeVisible();
});

test('about page lists data sources incl. self-compiled market closes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '關於與資料來源' }).click();
  await expect(page.locator('#markets-sources')).toContainText('自行彙整');
  await expect(page.locator('main')).toContainText('CC BY 3.0 IGO');
  await shot(page, '06-about');
});

test('offline: after first load the game is fully playable with network disabled', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // wait until precache finished (SW activated controls the page after reload)
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]!); return (await c.keys()).length; }).then((n) => expect(n).toBeGreaterThan(200));
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: '開始新的人生' }).click();
  await page.locator('input[name=era][value="past-year"]').check();
  await page.locator('input[name=year]').fill('1975');
  await page.locator('input[name=seed]').fill('offline-1');
  await page.getByRole('button', { name: '抽出生卡' }).click();
  await page.getByRole('button', { name: '開始過日子' }).click();
  await page.getByRole('button', { name: '快轉到終點' }).click();
  await expect(page.getByRole('heading', { name: '人生結算' })).toBeVisible({ timeout: 30000 });
  await shot(page, '07-offline-death');
  await context.setOffline(false);
});
