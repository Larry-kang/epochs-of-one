// v0.7.1 playback timing: speed ratio on plain years, event years ≈ plain years, readable auto-choice cards with a
// countdown bar, and an unattended full life at 16× (default pace, auto on, nobody clicking) that reaches death.
import { test, expect, type Page } from '@playwright/test';
import { toBirth } from './auto.ts';

type W = { T: number[]; K: boolean[]; C: number[]; bar: number };
async function start(page: Page, speed: number, seed: string): Promise<void> {
  await toBirth(page, seed, { pace: 60, country: 'TWN', year: 1990 });
  await page.locator('#begin').click();
  if (!(await page.locator('#auto[aria-pressed="true"]').count())) await page.locator('#auto').evaluate((b) => (b as HTMLElement).click());
  await page.locator(`.spd[data-speed="${speed}"]`).evaluate((b) => (b as HTMLElement).click());
  // T: time of each year tick; K: whether a card/prompt was open during that year; C: how long each card stayed open
  await page.evaluate(() => { const w = window as unknown as W; const el = document.querySelector('#age')!; let last = el.textContent, card = false, open = 0;
    w.T = [performance.now()]; w.K = [false]; w.C = []; w.bar = 0;
    new MutationObserver(() => { if (el.textContent !== last) { last = el.textContent; w.T.push(performance.now()); w.K.push(card); card = false; } }).observe(el, { childList: true, characterData: true, subtree: true });
    setInterval(() => { const b = document.querySelector('#choice') as HTMLElement | null; const o = (!!b && !b.hidden) || !(document.querySelector('#panel') as HTMLElement | null)?.hidden;
      if (o) { card = true; if (document.querySelector('#auto-i')) w.bar++; } if (o && !open) open = performance.now(); if (!o && open) { w.C.push(performance.now() - open); open = 0; } }, 20); });
}
const get = (page: Page) => page.evaluate(() => { const w = window as unknown as W; return { T: w.T, K: w.K, C: w.C, bar: w.bar }; });
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };
const plainGaps = (w: W, from = 1) => w.T.slice(from).map((t, i) => [t - w.T[from + i - 1]!, w.K[from + i]] as const).filter(([, k]) => !k).map(([g]) => g);

test('v0.7.1 16× vs 4× per plain year ≈ 4×; event years cost the same as plain years', async ({ page }) => {
  test.setTimeout(240000);
  await start(page, 4, 'speed-ratio');
  await expect.poll(async () => plainGaps(await get(page)).length, { timeout: 120000, intervals: [500] }).toBeGreaterThanOrEqual(3);
  const slow = median(plainGaps(await get(page)));
  await page.locator('.spd[data-speed="16"]').evaluate((b) => (b as HTMLElement).click());
  const n0 = (await get(page)).T.length;
  await expect.poll(async () => plainGaps(await get(page), n0 + 1).length, { timeout: 120000, intervals: [250] }).toBeGreaterThanOrEqual(12);
  const fastGaps = plainGaps(await get(page), n0 + 1); const fast = median(fastGaps);
  console.log(`4×: ${(slow / 1000).toFixed(2)} s/yr · 16×: ${(fast / 1000).toFixed(2)} s/yr · ratio ${(slow / fast).toFixed(2)} · slowest card-free year ${(Math.max(...fastGaps) / 1000).toFixed(2)} s`);
  expect(slow / fast).toBeGreaterThan(4 * 0.85); expect(slow / fast).toBeLessThan(4 * 1.15);
  expect(Math.max(...fastGaps)).toBeLessThan(fast * 1.25);   // years with logged events are not slower
});

test('v0.7.1 unattended full life at 16× with auto-choice reaches death in about 4–5 min; cards readable with a countdown', async ({ page }) => {
  test.setTimeout(480000);
  await start(page, 16, 'speed-life');
  const t0 = Date.now();
  await expect(page.locator('.ending, .death-page').first()).toBeAttached({ timeout: 420000 });
  const sec = (Date.now() - t0) / 1000; const w = await get(page);
  console.log(`full life at 16×: ${w.T.length - 1} years in ${sec.toFixed(1)} s; ${w.C.length} cards/prompts, shortest ${(Math.min(...w.C) / 1000).toFixed(2)} s, total ${(w.C.reduce((a, b) => a + b, 0) / 1000).toFixed(1)} s`);
  expect(sec).toBeLessThan(360);
  expect(Math.min(...w.C)).toBeGreaterThan(1000);   // never instant
  expect(w.bar).toBeGreaterThan(0);                 // countdown bar shown
});
