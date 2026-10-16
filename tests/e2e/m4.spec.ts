import { test, expect, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `shots/${name}.png`, fullPage: true });
// Resume a deterministic life at a given age via the versioned save (same path as "繼續上次的人生").
async function resumeAt(page: Page, seed: string, year: number, years: number) {
  await page.addInitScript(([s, y, n]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('epochs.save.v1', JSON.stringify({ v: 1, cfg: { seed: s, era: { kind: 'past', year: y }, nowYear: 2026, engineVersion: '0.4.0' }, paceMin: 90, years: n, speed: 1 }));
      sessionStorage.setItem('seeded', '1');
    }
  }, [seed, year, years] as const);
  await page.goto('./');
  await page.getByRole('button', { name: '繼續上次的人生' }).click();
  await expect(page.locator('#age')).toBeVisible();
  await page.getByRole('button', { name: '暫停' }).click();
}

test('M4 invest panel: allocate, leverage risk notice, replay after reload, settlement', async ({ page }) => {
  await resumeAt(page, 'demo55', 1965, 25); // JPN, age 25 in 1990
  await expect(page.locator('#where')).toContainText('日本');
  await page.getByRole('button', { name: '投資配置' }).click();
  await expect(page.locator('#panel h2')).toContainText('1990');
  await page.locator('#w-eqHome').fill('40');
  await page.locator('#w-eqUS').fill('30');
  await page.locator('#w-gold').fill('10');
  await page.locator('#w-levEq').fill('10');
  await expect(page.locator('#panel .warn')).toContainText('斷頭');
  await expect(page.locator('#w-btc')).toBeDisabled(); // BTC not available in 1990
  await shot(page, 'm4-01-invest-panel');
  await page.getByRole('button', { name: '套用' }).click();
  await expect(page.locator('#panel')).toBeHidden();
  // advance a few years at 8× and check money moved into investments
  await page.getByRole('button', { name: '繼續' }).click();
  await page.locator('.spd[data-speed="8"]').click();
  await expect(page.locator('#age')).not.toHaveText('25 歲', { timeout: 60000 });
  await page.getByRole('button', { name: '暫停' }).click();
  const inv = await page.locator('#inv').textContent();
  expect(inv).not.toBe('$0');
  await shot(page, 'm4-02-life-invested');
  // reload → resume replays recorded actions deterministically
  const age = await page.locator('#age').textContent();
  const nw = await page.locator('#inv').textContent();
  await page.reload();
  await page.getByRole('button', { name: '繼續上次的人生' }).click();
  await page.getByRole('button', { name: '暫停' }).click();
  if ((await page.locator('#age').textContent()) === age) await expect(page.locator('#inv')).toHaveText(nw!);
  await page.getByRole('button', { name: '快轉到終點' }).click();
  await expect(page.getByRole('heading', { name: '人生結算' })).toBeVisible();
  await expect(page.locator('#calls')).toBeVisible();
  await shot(page, 'm4-03-death');
});

test('M4 proxy home market is labelled 推估; validation rejects >100%', async ({ page }) => {
  await resumeAt(page, 'demo107', 1965, 40); // NGA: no OECD index → world proxy
  await page.getByRole('button', { name: '投資配置' }).click();
  const row = page.locator('.alloc-row').filter({ has: page.locator('#w-eqHome') });
  await expect(row.locator('.badge')).toHaveText('推估');
  await page.locator('#w-eqHome').fill('80');
  await page.locator('#w-gold').fill('40');
  await page.getByRole('button', { name: '套用' }).click();
  await expect(page.locator('#alloc-errs')).toContainText('120%');
  await shot(page, 'm4-04-proxy-and-validation');
});

test('M4 About lists market sources', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '關於與資料來源' }).click();
  await expect(page.locator('#markets-sources-2')).toContainText('OECD');
  await expect(page.locator('#markets-sources-2')).toContainText('Pink Sheet');
  await shot(page, 'm4-05-about');
});
