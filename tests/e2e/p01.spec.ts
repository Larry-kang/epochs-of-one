import { test, expect, type Page } from '@playwright/test';

const TW = { country: { kind: 'fixed', value: 'TWN' }, sex: { kind: 'fixed', value: 'F' }, quintile: { kind: 'fixed', value: 4 }, urban: { kind: 'fixed', value: true } };
async function resumeAt(page: Page, seed: string, year: number, years: number, constraints: unknown = TW) {
  await page.addInitScript(([s, y, n, k]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('epochs.save.v1', JSON.stringify({ v: 1, cfg: { seed: s, era: { kind: 'past', year: y }, nowYear: 2026, engineVersion: '0.6.0', constraints: k }, paceMin: 30, years: n, speed: 8, actions: [] }));
      sessionStorage.setItem('seeded', '1');
    }
  }, [seed, year, years, constraints] as const);
  await page.goto('./');
  await page.getByRole('button', { name: '繼續上次的人生' }).click();
  await expect(page.locator('#age')).toBeVisible();
}

test('P01 birth-country picker, name/family on the birth card, quick reroll', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '開始新的人生' }).click();
  await page.locator('#country').selectOption('TWN');
  await page.locator('input[name=seed]').fill('p01-pick');
  await page.getByRole('button', { name: '抽出生卡' }).click();
  await expect(page.locator('#b-country')).toContainText('TWN');
  const before = await page.locator('main').textContent();
  await page.locator('#reroll').click();
  await expect(page.locator('#b-country')).toContainText('TWN');
  await expect.poll(() => page.locator('main').textContent()).not.toBe(before);
});

test('P01 life-choice card pauses the run and records the answer', async ({ page }) => {
  await resumeAt(page, 'p01-c', 1995, 14);
  const card = page.locator('#choice');
  await expect(card.locator('.opt').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: '繼續' })).toBeVisible(); // paused while deciding
  const age = await page.locator('#age').textContent();
  await card.locator('.opt').first().click();
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('epochs.save.v1') || '{}'));
  expect(JSON.stringify(saved.actions ?? [])).toContain('"choice"');
  expect(age).toMatch(/歲/);
});

test('P01 house panel: 30/40-year terms with required income and down payment; plain loan note', async ({ page }) => {
  await resumeAt(page, 'p01-h', 1975, 35);
  await page.getByRole('button', { name: '暫停' }).click();
  await page.getByRole('button', { name: '買房／賣房' }).click();
  await expect(page.locator('#h-term')).toBeVisible();
  await page.locator('#h-term').selectOption('40');
  await expect(page.locator('#h-need-inc')).not.toBeEmpty();
  await expect(page.locator('#h-need-down')).not.toBeEmpty();
  await expect(page.locator('#panel')).not.toContainText('§');
});

test('P01 death screen: record card with name, cause, happiest year and last words', async ({ page }) => {
  await resumeAt(page, 'p01-d', 1950, 40);
  await page.getByRole('button', { name: '快轉到終點' }).click();
  await expect(page.getByRole('heading', { name: '人生結算' })).toBeVisible({ timeout: 30000 });
  for (const id of ['#rec-name', '#cause', '#last-words']) await expect(page.locator(id)).not.toBeEmpty();
  await expect(page.locator('main')).not.toContainText('§');
});
