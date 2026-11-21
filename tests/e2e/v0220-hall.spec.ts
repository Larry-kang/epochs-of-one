// v0.22.0 (item 5 P1, C1): local memorial hall — past lives as stones, epitaphs only in localStorage.
// Note (systematic-debugging, first green run): <input> value sanitisation strips LF, so the whitespace case uses tabs.
import { test, expect, type Page } from '@playwright/test';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';

const mk = (seed: string, year: number): LifeConfig => ({ seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: '0.10.0', occ: true, l2: true,
  constraints: { country: { kind: 'fixed', value: 'TWN' }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
const lives = [mk('dec5hall01', 1960), mk('dec5hall02', 1975)].map((cfg, i) => {
  const s = runLife(loadBundleFromDisk(), cfg); if (!('death' in s) || !s.death) throw new Error('fixture life must end');
  return { id: `hall-${i}`, seed: cfg.seed, iso: 'TWN', name: `測試${i}（臺灣）`, year: cfg.era.kind === 'past' ? cfg.era.year : 0, age: s.death.age, netWorth: 1000 * (i + 1), at: 0, cfg, years: 200, actions: [], paceMin: 30 };
});
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
async function openHall(page: Page, lang = 'zh-TW'): Promise<string[]> {
  const ext: string[] = [];
  page.on('request', (r) => { const u = r.url(); if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(u)) ext.push(u); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await page.evaluate(([ls, l]) => { localStorage.clear(); localStorage.setItem('epochs.lang.v1', l as string); localStorage.setItem('epochs.notice.v1', '1'); localStorage.setItem('epochs.lives.v1', JSON.stringify(ls)); }, [lives, lang] as const);
  await page.goto('./');
  await page.locator('#hall-open').click();
  await page.locator('#hall').waitFor();
  return ext;
}

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`memorial hall shows past lives as stones and keeps epitaphs on this device (${tag})`, async ({ page }) => {
    await page.setViewportSize(vp);
    const ext = await openHall(page);
    await expect(page.locator('.stone')).toHaveCount(2);
    await expect(page.locator('#hall-local')).toBeVisible();
    const stone = page.locator('.stone').first();
    await stone.locator('.ep-input').evaluate((el: HTMLInputElement) => { el.removeAttribute('maxlength'); el.value = '一生\t\t平凡\u202E，' + '好'.repeat(70); });
    await stone.locator('.ep-save').click();
    const want = ('一生 平凡，' + '好'.repeat(70)).slice(0, 60);
    await expect(stone.locator('.epitaph')).toHaveText(want);
    expect(await page.evaluate(() => localStorage.getItem('epochs.epitaph.hall-0'))).toBe(want);
    expect(await noOverflow(page)).toBe(true);
    await page.reload(); await page.locator('#hall-open').click();
    await expect(page.locator('.stone').first().locator('.epitaph')).toHaveText(want);
    // the epitaph never leaves the device: not in the share link
    await page.locator('.stone').first().locator('.hall-reopen').click();
    await page.locator('#record').waitFor({ timeout: 60000 });
    await page.locator('#share-open').click();
    const link = await page.locator('#sh-link-url').inputValue();
    const json = await page.evaluate(async (h) => { const b = Uint8Array.from(atob(h.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (h.length % 4)) % 4)), (c) => c.charCodeAt(0));
      return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text(); }, link.split('#r=')[1]!);
    expect(json).not.toContain('平凡');
    expect(ext).toEqual([]);
  });
}

test('clearing an epitaph removes it from storage', async ({ page }) => {
  await openHall(page);
  const stone = page.locator('.stone').nth(1);
  await stone.locator('.ep-input').fill('暫時的話'); await stone.locator('.ep-save').click();
  expect(await page.evaluate(() => localStorage.getItem('epochs.epitaph.hall-1'))).toBe('暫時的話');
  await stone.locator('.ep-input').fill('   '); await stone.locator('.ep-save').click();
  expect(await page.evaluate(() => localStorage.getItem('epochs.epitaph.hall-1'))).toBeNull();
});

for (const [lang, word] of [['en', 'Memorial'], ['ja', '追悼館'], ['ko', '추모관']] as const) {
  test(`memorial hall is translated (${lang})`, async ({ page }) => {
    await openHall(page, lang);
    await expect(page.locator('#hall h1')).toContainText(word);
  });
}
