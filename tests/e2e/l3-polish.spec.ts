// v0.11.1: localised names + display currency. EN UI / US life → English name, US$ amounts, no Han text in the log;
// JA UI / JP life → ¥ amounts. Display-only (engine unchanged).
import { test, expect } from '@playwright/test';
import { toBirth, playToAge } from './auto.ts';

test.describe.configure({ timeout: 300_000 });
const HAN = /[\u4e00-\u9fff]/;

test('EN UI, US life: English name, US$ amounts, story text in English', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./'); await page.locator('.foot .lang-sel').selectOption('en', { timeout: 10000 });
  await toBirth(page, 'l3e-USA-1', { country: 'USA', year: 1980 });
  const cert = await page.locator('#cert').innerText();
  expect(cert).not.toMatch(HAN);
  await page.locator('#begin').click();
  await playToAge(page, 30);
  const log = await page.locator('#log').innerText();
  expect(log).not.toMatch(HAN);
  await expect(page.locator('body')).toContainText('US$');
  expect(await page.locator('[lang="zh-Hant"]').count()).toBe(0);
});

test('JA UI, JP life: amounts in ¥', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./'); await page.locator('.foot .lang-sel').selectOption('ja', { timeout: 10000 });
  await toBirth(page, 'l3e-JPN-1', { country: 'JPN', year: 1980 });
  await page.locator('#begin').click();
  await playToAge(page, 30);
  await expect(page.locator('body')).toContainText('¥');
  expect(await page.locator('[lang="zh-Hant"]').count()).toBe(0);
});
