// v0.21.0 (item 5 P1, B1+B2): replay link in the URL fragment (read-only, journal never included) + QR on the share card.
import { test, expect, type Page, type Browser } from '@playwright/test';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';

const cfg: LifeConfig = { seed: 'dec5link01', era: { kind: 'past', year: 1972 }, nowYear: 2026, engineVersion: '0.10.0', occ: true, l2: true,
  constraints: { country: { kind: 'fixed', value: 'TWN' }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } };
const s = runLife(loadBundleFromDisk(), cfg);
if (!('death' in s) || !s.death) throw new Error('fixture life must end');
const past = { id: 'dec5-life', seed: cfg.seed, iso: 'TWN', name: '測試（臺灣）', year: 1972, age: s.death.age, netWorth: 1, at: 1972 + s.death.age, cfg, years: 200, actions: [], paceMin: 30 };
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function shareLink(page: Page): Promise<string> {
  await page.goto('./');
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('epochs.lang.v1', 'zh-TW'); localStorage.setItem('epochs.notice.v1', '1');
    localStorage.setItem('epochs.lives.v1', JSON.stringify([p])); localStorage.setItem('epochs.journal.dec5-life', JSON.stringify({ 20: 'SECRET-DIARY-NOTE' })); }, past);
  await page.goto('./');
  await page.locator('.past-open').first().click();
  await page.locator('#record').waitFor({ timeout: 60000 });
  await page.locator('#share-open').click();
  await page.locator('#share-sheet[open] #sh-link-url').waitFor({ timeout: 30000 });
  await expect(page.locator('#share-img')).toHaveAttribute('data-qr', 'replay');
  return page.locator('#sh-link-url').inputValue();
}
async function fresh(browser: Browser, vp = { width: 1280, height: 860 }, lang = 'zh-TW'): Promise<Page> {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce', locale: 'zh-TW' });
  const p = await ctx.newPage();
  await p.addInitScript((l) => { if (!sessionStorage.getItem('init')) { localStorage.setItem('epochs.lang.v1', l); sessionStorage.setItem('init', '1'); } }, lang);
  return p;
}

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`share link replays the same life read-only on another device (${tag})`, async ({ page, browser }) => {
    await page.setViewportSize(vp);
    const link = await shareLink(page);
    expect(link).toMatch(/#r=[A-Za-z0-9_-]+$/);
    const name = await page.locator('#rec-name').textContent();
    expect(await noOverflow(page)).toBe(true);
    const b = await fresh(browser, vp);
    await b.goto(link);
    await expect(b.locator('#replay-banner')).toBeVisible({ timeout: 60000 });
    await expect(b.locator('#rec-name')).toHaveText(name!);
    expect(b.url()).not.toContain('#r=');
    expect(await noOverflow(b)).toBe(true);
    expect(await b.evaluate(() => localStorage.getItem('epochs.lives.v1'))).toBeNull();
    expect(await b.evaluate(() => JSON.stringify(localStorage))).not.toContain('SECRET-DIARY-NOTE');
  });
}

test('the link carries no journal text', async ({ page }) => {
  const link = await shareLink(page);
  const json = await page.evaluate(async (h) => {
    const b = Uint8Array.from(atob(h.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (h.length % 4)) % 4)), (c) => c.charCodeAt(0));
    return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }, link.split('#r=')[1]!);
  expect(json).toContain('dec5link01');
  expect(json).not.toContain('SECRET-DIARY-NOTE');
  expect(Object.keys(JSON.parse(json)).sort()).toEqual(['actions', 'era', 'pace', 'seed', 'v', 'x']);
});

test('a link from another version is refused with a clear notice', async ({ browser }) => {
  const b = await fresh(browser);
  await b.goto('./');
  const h = await b.evaluate(async () => {
    const raw = JSON.stringify({ v: '0.19.0', seed: 'dec5link01', era: { kind: 'past', year: 1972 }, pace: 30, actions: [] });
    const buf = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let s = ''; for (const c of buf) s += String.fromCharCode(c);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
  const c = await fresh(browser);
  await c.goto('./#r=' + h);
  await expect(c.locator('#replay-notice')).toContainText('v0.19.0');
  await expect(c.locator('#replay-banner')).toHaveCount(0);
});

test('a broken link shows a notice on the home page', async ({ browser }) => {
  const b = await fresh(browser);
  await b.goto('./#r=@@@');
  await expect(b.locator('#replay-notice')).toBeVisible();
  await expect(b.locator('#go')).toBeVisible();
});

for (const [lang, word] of [['en', 'Shared'], ['ja', '共有'], ['ko', '공유']] as const) {
  test(`replay banner is translated (${lang})`, async ({ page, browser }) => {
    const link = await shareLink(page);
    const b = await fresh(browser, undefined, lang);
    await b.goto(link);
    await expect(b.locator('#replay-banner')).toContainText(word, { timeout: 60000 });
  });
}
