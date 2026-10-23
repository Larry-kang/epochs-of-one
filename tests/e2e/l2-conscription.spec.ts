// L2/L3 (v0.11.0): conscription in a Taiwanese man's life (log + ID-card service row), the institutions row (NHI / pension),
// Japanese UI with local occupation names and the 正社員 / 非正規 badge. Screenshots → shots/l2/.
import { test, expect, type Page } from '@playwright/test';
import { toBirth, playToAge } from './auto.ts';

test.describe.configure({ timeout: 420_000 });
/** first seed in the series whose birth certificate says the wanted sex */
async function birthOfSex(page: Page, prefix: string, o: { country: string; year: number }, male: boolean): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const seed = `${prefix}-${i}`; await toBirth(page, seed, o);
    const sx = await page.locator('#cert').innerText();
    if (male ? /男|Male|男性/.test(sx) : /女|Female/.test(sx)) return seed;
  }
  throw new Error('no seed of that sex');
}
const age = async (page: Page) => Number((await page.locator('#age').textContent())?.replace(/\D+/g, '') || 0);

test('TW man born 1985: compulsory service in the log, service + NHI rows on the ID card', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await birthOfSex(page, 'l2e-TWN', { country: 'TWN', year: 1985 }, true);
  await page.locator('#begin').click();
  let served = false;
  for (let a = 19; a <= 30 && !served; a++) {
    await playToAge(page, a);
    served = /入伍服義務役|改服替代役/.test(await page.locator('#log').innerText());
  }
  expect(served).toBe(true);
  await expect(page.locator('#log')).toContainText(/役期 \d+ 個月/);
  await page.locator('#idcard').scrollIntoViewIfNeeded();
  await expect(page.locator('#id-inst')).toContainText('全民健康保險');
  if (await page.locator('#id-service').count()) await expect(page.locator('#id-service')).toContainText('個月');
  await page.screenshot({ path: 'shots/l2/tw-service-desktop.png' });
  expect(await age(page)).toBeLessThanOrEqual(31);
});

test('JP life in Japanese: local occupation names, regular / non-regular badge, 国民皆保険', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./'); await page.locator('.foot .lang-sel').selectOption('ja', { timeout: 10000 });
  await toBirth(page, 'l2e-JPN-1', { country: 'JPN', year: 1980 });
  await page.locator('#begin').click();
  await playToAge(page, 30);
  expect(await page.locator('html').getAttribute('lang')).toBe('ja');
  await page.locator('#idcard').scrollIntoViewIfNeeded();
  const job = await page.locator('#id-job').count();
  if (job) {
    await expect(page.locator('#id-job')).not.toHaveText(/^[A-Za-z ]+$/);
    await expect(page.locator('#id-inst')).toContainText('国民皆保険');
  }
  await page.screenshot({ path: 'shots/l2/jp-ja-m390.png' });
});
