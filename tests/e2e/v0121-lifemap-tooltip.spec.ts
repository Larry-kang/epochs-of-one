import { test, expect } from '@playwright/test';
import { playToAge, toBirth } from './auto.ts';

test('v0.12.1 lifemap tooltips render event parameters and money', async ({ page }) => {
  test.setTimeout(240_000);
  await toBirth(page, 'v0121-lifemap-tooltip', { pace: 60, country: 'TWN', year: 1990 });
  await page.locator('#begin').click();
  await playToAge(page, 30);

  const titles = await page.locator('#lifemap .cell.on').evaluateAll((cells) =>
    cells.map((cell) => cell.getAttribute('title') ?? ''),
  );
  expect(titles.length).toBeGreaterThan(0);
  const titleText = titles.join('\n');
  expect(titleText).toMatch(/(?:US\$|NT\$|¥|₩|CN¥|€|£|₹|HK\$|S\$|C\$|A\$|₫|₱|฿|₦|₪|R\$|MX\$|CHF\s|₽|₺|₴|Rp|RM)\s*\d[\d,]*/);
  expect(titleText).not.toMatch(/…|\{/);
});
