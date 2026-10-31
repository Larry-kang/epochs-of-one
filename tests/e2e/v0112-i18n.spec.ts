// v0.11.2: Japanese and Korean UI coverage for home, birth, life and death, plus localised last-words names.
import { test, expect, type Page } from '@playwright/test';
import { toBirth, playToAge, skipToEnd } from './auto.ts';

test.describe.configure({ timeout: 300_000 });

const HOME_EN = [
  'Every second about',
  'This year. From now on, economy and markets are resampled from history.',
  'Random (weighted by births)',
  'If you were born right now',
];
const BIRTH_EN = [
  'You were born',
  'Birth registration',
  'Name',
  'Sex',
  'City',
  'Mother',
  'Father',
  'Level 1 of 5',
  'Family',
  'Only child',
  'Of the babies born that year',
];
const LIFE_EN = [
  'Age',
  'Female',
  'City',
  'Primary',
  'Studying',
  'Cash',
  'Invested',
  'Investments',
  'Buy / sell home',
  'Loan',
  'Annuity',
];
const DEATH_EN = [
  'Died in',
  'born in',
  'Studied up to',
  'Cause of death',
  'Among simulated peers',
  'Lifetime income',
  'Copy seed',
];

async function setLang(page: Page, lang: 'ja' | 'ko'): Promise<void> {
  await page.goto('./');
  await page.locator('.foot .lang-sel').selectOption(lang);
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

function expectNo(text: string, blocked: string[], where: string): void {
  for (const s of blocked) expect(text, `${where}: ${s}`).not.toContain(s);
}

for (const lang of ['ja', 'ko'] as const) {
  test.describe(`${lang} UI`, () => {
    test('home has no English copy', async ({ page }) => {
      await setLang(page, lang);
      expectNo(await page.locator('body').innerText(), HOME_EN, 'home');
    });

    test('birth card has no English labels', async ({ page }) => {
      await setLang(page, lang);
      await toBirth(page, `v0112-birth-${lang}`, { country: 'BRA' });
      expectNo(await page.locator('#cert').innerText(), BIRTH_EN, 'birth');
    });

    test('in-game identity card and finance labels are translated', async ({ page }) => {
      await setLang(page, lang);
      await toBirth(page, `v0112-life-${lang}`, { country: 'TWN', year: 1990 });
      await page.locator('#begin').click();
      await playToAge(page, 18);
      expectNo(await page.locator('body').innerText(), LIFE_EN, 'life');
    });

    test('death record has no English labels', async ({ page }) => {
      await setLang(page, lang);
      await toBirth(page, `v0112-death-${lang}`, { country: 'TWN', year: 1980 });
      await page.locator('#begin').click();
      await skipToEnd(page);
      await expect(page.locator('#record')).toBeVisible();
      expectNo(await page.locator('body').innerText(), DEATH_EN, 'death');
    });

    test('last words use the same localised child name as the record', async ({ page }) => {
      await setLang(page, lang);
      await toBirth(page, 'Jcibzcf5vZ', { country: 'BRA' });
      await page.locator('#begin').click();
      await skipToEnd(page);
      await expect(page.locator('#record')).toBeVisible();
      const kids = (await page.locator('#rec-kids').innerText()).split('、');
      const words = await page.locator('#last-words').innerText();
      expect(words).toContain(kids[0]!);
    });
  });
}

test('EN last words use the localised child name (BR seed Jcibzcf5vZ)', async ({ page }) => {
  await page.goto('./');
  await page.locator('.foot .lang-sel').selectOption('en');
  await toBirth(page, 'Jcibzcf5vZ', { country: 'BRA' });
  await page.locator('#begin').click();
  await skipToEnd(page);
  await expect(page.locator('#record')).toBeVisible();
  const kids = (await page.locator('#rec-kids').innerText()).split('、');
  const words = await page.locator('#last-words').innerText();
  expect(words).toContain(kids[0]!);
  expect(words).not.toMatch(/[\u4e00-\u9fff]/u);
});
