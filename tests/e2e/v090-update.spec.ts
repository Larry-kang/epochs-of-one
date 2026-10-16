// v0.9.0 update prompt: a real service worker update. A tiny server serves dist/ (build A); after the page is controlled
// we serve a changed sw.js (build B), the new worker installs and waits, the banner appears; Refresh saves the life,
// activates the new worker and reloads; the life resumes where it was. At 390 the banner never covers decision buttons.
import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
let srv: Server, base = '', build = 'A';
test.beforeAll(async () => {
  srv = createServer((req, res) => {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]!); if (p.endsWith('/')) p += 'index.html';
    const f = join('dist', p);
    if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    let body: Buffer | string = readFileSync(f);
    if (p === '/sw.js') body = body.toString() + `\n// build ${build}\n`;
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(body);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(srv.address() as { port: number }).port}/`;
});
test.afterAll(() => srv.close());

for (const vp of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'm390', width: 390, height: 844 }]) {
  test(`v090 update prompt on a waiting service worker (${vp.name})`, async ({ page }) => {
    test.setTimeout(120_000);
    build = 'A';
    const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base);
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active);
    await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    // start a life and run a few years with a decision card open
    await page.locator('[data-pace="30"]').click();
    await page.locator('details.advanced summary').click();
    await page.locator('#country').selectOption('TWN');
    await page.locator('input[name=seed]').fill('v090-update');
    await page.locator('#go').click(); await page.locator('#begin').click();
    await page.evaluate(() => (document.querySelector('.spd[data-speed="16"]') as HTMLButtonElement).click());
    const opt = page.locator('#choice:not([hidden]) button.opt').first();
    await expect(opt).toBeVisible({ timeout: 60_000 });
    // build B is deployed
    build = 'B';
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    const bar = page.locator('#update-bar');
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await expect(bar).toContainText('有新版本');
    expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting)).toBe(true);
    // never over the decision buttons
    const b = (await bar.boundingBox())!;
    for (const btn of await page.locator('#choice button').all()) { const r = await btn.boundingBox(); if (!r) continue;
      expect(r.y >= b.y + b.height || r.y + r.height <= b.y || r.x >= b.x + b.width || r.x + r.width <= b.x, `banner covers ${await btn.innerText()}`).toBe(true); }
    await page.screenshot({ path: `shots/c0/update-prompt-${vp.name}.png` });
    // dismissable
    await page.locator('#update-x').click(); await expect(bar).toHaveCount(0);
    // a fresh check brings it back (the worker is still waiting); refresh = save + skipWaiting + reload
    await page.evaluate(() => location.reload());
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await page.locator('#cont').click(); await page.locator('#pause').waitFor();
    const age = Number((await page.locator('#age').textContent())?.replace(/\D+/g, '') || 0);
    await page.locator('#update-go').click();
    await page.waitForEvent('load');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.waiting)).toBeNull();
    const sw = await page.evaluate(async () => (await fetch('./sw.js')).text()); expect(sw).toContain('// build B');
    await expect(page.locator('#update-bar')).toHaveCount(0);
    await page.locator('#cont').click(); await page.locator('#pause').waitFor();
    const age2 = Number((await page.locator('#age').textContent())?.replace(/\D+/g, '') || 0);
    expect(age2).toBeGreaterThanOrEqual(age);
    expect(errs).toEqual([]);
  });
}
