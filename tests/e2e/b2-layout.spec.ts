// 0b: at 390px the ID card + status come before the life log. 0c: the name in the top bar is never cut off.
import { test, expect, type Page } from '@playwright/test';
import { toBirth } from './auto.ts';

async function nameFits(page: Page): Promise<void> {
  const nm = page.locator('#tb-name');
  await expect(nm).toBeVisible();
  await expect(nm).not.toHaveText('');
  const m = await nm.evaluate((el) => {
    const r = el.getBoundingClientRect(); const right = document.querySelector('.tb-right')!.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { over: el.scrollWidth - el.clientWidth, clip: cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '',
      inView: r.left >= 0 && r.right <= window.innerWidth + 0.5, overlap: right.width > 0 && r.right > right.left + 0.5 && r.bottom > right.top && r.top < right.bottom,
      font: parseFloat(cs.fontSize), width: el.clientWidth, title: el.getAttribute('title'), text: el.textContent };
  });
  expect(m.over).toBeLessThanOrEqual(1);
  expect(m.clip).toBe(false);
  expect(m.inView).toBe(true);
  expect(m.overlap).toBe(false);
  expect(m.font).toBeGreaterThanOrEqual(12);
  expect(m.title).toBe(m.text);
  expect(m.width).toBeGreaterThanOrEqual(m.font * Math.min(6, (m.text ?? "").length) * 0.9);   // room for several glyphs per line, not one per line
}

for (const [tag, vp] of [['desktop', { width: 1280, height: 860 }], ['m390', { width: 390, height: 844 }]] as const) {
  test(`B2 0c top-bar name readable (${tag})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await toBirth(page, `b2-name-${tag}`, { country: 'VNM', year: 1990 });
    await page.locator('#begin').click();
    await nameFits(page);
    // worst case: a very long full name must wrap, not be cut
    await page.locator('#tb-name').evaluate((el: HTMLElement) => { el.textContent = 'Maximilian Alexander Konstantin von Hohenberg-Rittersdorf'; el.title = el.textContent; });
    await nameFits(page);
    await page.screenshot({ path: `shots/batch2/${tag}-topbar-name.png`, clip: { x: 0, y: 0, width: vp.width, height: 140 } });
  });
}

test('B2 0b at 390px ID card and status come before the life log', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toBirth(page, 'b2-order', { country: 'TWN', year: 1990 });
  await page.locator('#begin').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const y = async (sel: string) => (await page.locator(sel).boundingBox())!.y;
  const [id, st, log] = [await y('#idcard'), await y('section.status'), await y('.logcard')];
  expect(id).toBeLessThan(log);
  expect(st).toBeLessThan(log);
  expect(log).toBeLessThan(844 - 120);   // v0.7.1: the log (heading + first entries) starts above the fold
  await page.screenshot({ path: 'shots/batch2/m390-order-idcard-first.png' });
});
