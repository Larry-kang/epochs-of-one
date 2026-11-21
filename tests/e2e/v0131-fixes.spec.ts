import { test, expect } from '@playwright/test';
import { skipToEnd, toBirth } from './auto.ts';

// v0.13.1: long stat labels (en "Happiness", "Knowledge") ran under the bars because the label column was a fixed 3.4em.
for (const lang of ['en', 'vi'] as const) for (const width of [1280, 390]) {
  test(`v0.13.1 stat labels do not overlap their bars (${lang} ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((l) => localStorage.setItem('epochs.lang.v1', l), lang);
    await toBirth(page, `v0131-stats-${lang}-${width}`);
    await page.locator('#begin').click();
    await page.locator('.stat').first().waitFor();
    const overlaps = await page.locator('.stat').evaluateAll((rows) => rows.map((row) => {
      const label = row.firstElementChild as HTMLElement; const bar = label.nextElementSibling as HTMLElement;
      const r = document.createRange(); r.selectNodeContents(label);
      return { text: label.textContent, over: Math.round(r.getBoundingClientRect().right - bar.getBoundingClientRect().left) };
    }).filter((x) => x.over > 0));
    expect(overlaps).toEqual([]);
    const lefts = await page.locator('.stat .bar').evaluateAll((bars) => bars.map((b) => Math.round(b.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(1); // bars stay aligned in one column
  });
}

test('v0.13.1 English death story reads as a sentence', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('epochs.lang.v1', 'en'));
  await toBirth(page, 'v0131-story-en', { country: 'USA' });
  await page.locator('#begin').click();
  await skipToEnd(page);
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/was born in the United States in \d{4}/);
  expect(body).not.toMatch(/Studied up to [A-Z]/);
  expect(body).not.toMatch(/Worked in:/);
});

test('v0.13.1 Korean death story resolves particles', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('epochs.lang.v1', 'ko'));
  await toBirth(page, 'v0131-story-ko', { country: 'KOR' });
  await page.locator('#begin').click();
  await skipToEnd(page);
  const story = await page.locator('body').innerText();
  expect(story).toMatch(/[가-힣](은|는) \d{4}년/);
  expect(story).not.toMatch(/[가-힣](은\(는\)|와\(과\)|이\(가\)|을\(를\))/);
});
