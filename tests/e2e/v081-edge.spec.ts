// v0.8.1 Edge smoke: the app opens and reaches the birth certificate with an Edge user agent (fresh profile and a profile
// holding a v0.7 save); the service worker is the v0.8.1 one (reload-fresh precache, network-first navigations).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';
test.use({ userAgent: EDGE_UA });
const v07 = JSON.parse(readFileSync('tests/fixtures/v07-storage.json', 'utf8')) as Record<string, unknown>;

for (const withSave of [false, true]) {
  test(`v081 Edge UA smoke (${withSave ? 'v0.7 save' : 'fresh'})`, async ({ page }) => {
    const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message));
    const bad: string[] = []; page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    if (withSave) await page.addInitScript((kv) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v)); } }, v07);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await expect(page.locator('#go')).toBeVisible();
    if (withSave) await expect(page.locator('#cont')).toBeVisible();
    const sw = await page.evaluate(async () => (await fetch('./sw.js')).text());
    expect(sw).toContain("cache: 'reload'");
    await page.locator('#go').click();
    await expect(page.locator('#begin')).toBeVisible();
    await page.reload(); // second load goes through the registered service worker
    await expect(page.locator('#go')).toBeVisible();
    expect(errs).toEqual([]); expect(bad).toEqual([]);
  });
}

for (const [label, raw] of [['missing name', '[{"id":"a","seed":"s","iso":"TW","age":40}]'], ['null entry', '[null]'], ['malformed JSON', '[{"id":']] as const) {
  test(`v081 Edge UA: bad past-lives data (${label}) still renders home`, async ({ page }) => {
    const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((v) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('epochs.lives.v1', v); } }, raw);
    await page.goto('./');
    await expect(page.locator('#go')).toBeVisible();
    await expect(page.locator('.past-lives')).toBeVisible();
    expect(errs).toEqual([]);
  });
}
