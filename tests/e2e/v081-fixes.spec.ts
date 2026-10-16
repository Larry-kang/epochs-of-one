// v0.8.1 fixes: past-life reopen renders from its stored snapshot (no dependence on a deterministic replay), old v0.7
// saves open, child offers under a family focus always show their card first.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { autoAnswer, toBirth } from './auto.ts';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { newLife, advanceYear, applyAction, type LifeConfig } from '../../src/engine/life/sim.ts';
import type { LifeState, Action } from '../../src/engine/life/state.ts';
import { contentEvents } from '../../src/engine/content/registry.ts';

const v07 = JSON.parse(readFileSync('tests/fixtures/v07-storage.json', 'utf8')) as Record<string, unknown>;
const seed = async (page: import('@playwright/test').Page, o: Record<string, unknown>) => {
  await page.addInitScript((kv) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v)); } }, o);
};

test('v081 v0.7 save fixture: home opens, resumes the life, and an old past life (no snapshot) reopens', async ({ page }) => {
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message));
  await seed(page, v07);
  await page.goto('./');
  await expect(page.locator('.past-open')).toHaveCount(1);
  await page.locator('.past-open').first().click();
  await expect(page.locator('#rec-name')).toBeVisible({ timeout: 30000 });
  expect(errs).toEqual([]);
});

test('v081 reopen renders from the stored snapshot even when the replay recipe diverges (focus health)', async ({ page }) => {
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message));
  // recorded years cut short + a health focus: replaying this recipe alone does not end in death
  const life = { id: 'div-1', seed: 'div-1', iso: 'TWN', name: 'x', year: 1990, age: 70, netWorth: 0, at: 2060,
    cfg: { seed: 'div-1', era: { kind: 'past', year: 1990 }, nowYear: 2026, engineVersion: '0.9.1', constraints: { country: { kind: 'fixed', value: 'TWN' }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } },
    years: 30, actions: [{ t: 'focus', age: 25, w: { health: 1 } }], paceMin: 30, rec: { rk: { lifespan: 0.42, lifetimeIncome: 0.5, finalNetWorth: 0.5 }, peersN: 400 } };
  await seed(page, { 'epochs.lives.v1': [life] });
  await page.goto('./');
  const t0 = Date.now();
  await page.locator('.past-open').first().click();
  await expect(page.locator('#rec-name')).toBeVisible({ timeout: 5000 });
  expect(Date.now() - t0).toBeLessThan(5000);
  await expect(page.locator('.death-page')).toContainText('400');
  expect(errs).toEqual([]);
});

test('v081 family focus: every child offer is shown as a card before it is answered', async ({ page }) => {
  test.setTimeout(180_000);
  await autoAnswer(page);
  await toBirth(page, 'v081-kids-3', { country: 'IND', year: 1990, pace: 30 });
  await page.locator('#begin').click();
  await page.evaluate(() => (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement | null)?.click());
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('epochs.save.v1') ?? 'null') as { years: number; actions: Action[]; cfg: LifeConfig } | null);
  // pick family as soon as the work/idle stage card offers it, then live to 42
  for (let i = 0; i < 600; i++) {
    const fam = page.locator('.fpill[data-focus="family"]');
    if ((await fam.count()) && (await fam.getAttribute('aria-checked')) !== 'true') await fam.click().catch(() => {});
    const sv = await saved(); if (sv && sv.years >= 42) break;
    await page.waitForTimeout(250);
  }
  const sv = (await saved())!;
  expect(sv.actions.some((a) => a.t === 'focus' && 'w' in a && a.w?.family)).toBe(true);
  // replay the recorded recipe: every child offer the engine resolved (ch_child_* event) must have a recorded answer
  // (= its card was shown and answered), never a silent engine auto-pick
  const data = loadBundleFromDisk();
  let s = newLife(data, sv.cfg) as LifeState;
  for (let i = 0; i < sv.years && !s.death; i++) {
    for (const a of sv.actions) if ('age' in a && a.age === s.age) s = applyAction(data, s, a);
    s = advanceYear(data, s, contentEvents);
  }
  const resolved = s.events.filter((e) => e.id.startsWith('ch_child_'));
  const childOffers = resolved.length;
  for (const e of resolved) expect(sv.actions.some((a) => a.t === 'choice' && a.age === e.age && a.id === 'child'), `child offer at ${e.age} had no card`).toBe(true);
  expect(childOffers).toBeGreaterThan(0);
});

test('v081 child offer that exists only under last year\'s family focus shows its card on resume (not auto-picked)', async ({ page }) => {
  // fixture: an IND 1990 life with family focus from 20; at this age offersAt with the focus effect has a child offer
  // that the no-focus offer set lacks — before the fix the engine resolved it silently
  const f = JSON.parse(readFileSync('tests/fixtures/v081-child-offer.json', 'utf8')) as { cfg: LifeConfig; years: number; actions: Action[] };
  await seed(page, { 'epochs.save.v1': { v: 1, cfg: f.cfg, paceMin: 30, years: f.years, speed: 1, actions: f.actions } });
  await page.goto('./');
  await page.locator('#cont').click();
  await page.locator('#pause').waitFor();
  await page.locator('.spd[data-speed="16"]').click();
  await expect(page.locator('#choice .opt[data-opt="have"]')).toBeVisible({ timeout: 15000 });
  // the year has not been simulated behind the card
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('epochs.save.v1')!) as { years: number }).years)).toBe(f.years);
});
