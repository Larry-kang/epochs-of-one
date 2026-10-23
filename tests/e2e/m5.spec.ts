import { test, expect, type Page } from '@playwright/test';
import { autoAnswer, skipToEnd } from './auto.ts';

const shot = (page: Page, name: string) => page.screenshot({ path: `shots/${name}.png`, fullPage: true });
async function resumeAt(page: Page, seed: string, year: number, years: number, actions: unknown[] = [], pause = true, auto = true) {
  if (auto) await autoAnswer(page);
  await page.addInitScript(([s, y, n, a]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('epochs.save.v1', JSON.stringify({ v: 1, cfg: { seed: s, era: { kind: 'past', year: y }, nowYear: 2026, engineVersion: '0.5.0' }, paceMin: 30, years: n, speed: 8, actions: a }));
      sessionStorage.setItem('seeded', '1');
    }
  }, [seed, year, years, actions] as const);
  await page.goto('./');
  await page.getByRole('button', { name: '繼續上次的人生' }).click();
  await expect(page.locator('#age')).toBeVisible();
  if (pause) await page.getByRole('button', { name: '暫停' }).click();
}

test('M5 house + mortgage, then a normal-mode credit loan', async ({ page }) => {
  await resumeAt(page, 'demo68', 1965, 29); // JPN, can afford a house at 29 (P01 economy)
  await page.getByRole('button', { name: '買房／賣房' }).click();
  await expect(page.locator('#h-price')).toBeVisible();
  await shot(page, 'm5-01-house-quote');
  await page.getByRole('button', { name: '買下這間房子' }).click();
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('#debt')).toHaveText(/^[^0-9]*0$/); // mortgage is netted inside house equity
  await expect(page.locator('#heq')).not.toHaveText(/^[^0-9]*0$/);
  await page.getByRole('button', { name: '信貸' }).click();
  await expect(page.locator('#l-max')).toBeVisible();
  await page.locator('#l-amt').fill('999999999');
  await page.getByRole('button', { name: '套用' }).click();
  await expect(page.locator('#p-errs')).toContainText('金額需介於');
  await page.locator('#l-amt').fill('1000');
  await page.locator('#l-term').fill('3');
  await shot(page, 'm5-02-loan-panel');
  await page.getByRole('button', { name: '套用' }).click();
  await expect(page.locator('#debt')).not.toHaveText(/^[^0-9]*0$/);
  await page.getByRole('button', { name: '繼續' }).click();
  await expect(page.locator('#age')).not.toHaveText('29 歲', { timeout: 60000 });
  await page.getByRole('button', { name: '暫停' }).click();
  await shot(page, 'm5-03-life-house-loan');
});

test('M5 retirement pension + life annuity', async ({ page }) => {
  await resumeAt(page, 'demo55', 1965, 66);
  await expect(page.locator('#status')).toContainText('已退休');
  await page.getByRole('button', { name: '年金' }).click();
  await expect(page.locator('#a-rate')).toBeVisible();
  await shot(page, 'm5-04-annuity');
  await page.getByRole('button', { name: '套用' }).click();
  await expect(page.locator('#panel')).toBeHidden();
  await skipToEnd(page);
  await expect(page.getByRole('heading', { name: '人生結算' })).toBeVisible();
  await expect(page.locator('#pen')).not.toHaveText(/^[^0-9]*0$/);
  await shot(page, 'm5-05-death-pension');
});

test('M5 financial-distress bridge prompt appears when cash turns negative', async ({ page }) => {
  await resumeAt(page, 'br20', 1975, 24, [], false, false); // CHN (legacy save → occupations from 24, v0.9.0): cash goes negative at 24→25
  await expect(page.locator('#bridge-msg')).toBeVisible({ timeout: 60000 });
  await shot(page, 'm5-06-bridge-prompt');
  await page.getByRole('button', { name: '申請周轉' }).click();
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('#debt')).not.toHaveText(/^[^0-9]*0$/);
});

test('M5 ineligible country explains why credit is closed; About lists M5 sources', async ({ page }) => {
  await resumeAt(page, 'demo107', 1965, 40); // NGA: 停用
  await page.getByRole('button', { name: '信貸' }).click();
  await expect(page.locator('#l-why')).toContainText('信貸規則資料不足');
  await page.getByRole('button', { name: '關閉' }).click();
  await page.goto('./');
  await page.getByRole('button', { name: '關於與資料來源' }).click();
  await expect(page.locator('#m5-sources')).toContainText('Pensions at a Glance');
  await shot(page, 'm5-07-about');
});
