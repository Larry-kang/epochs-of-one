import { defineConfig } from '@playwright/test';
// Own port (not 4173, which another process may use); override with E2E_PORT.
const PORT = Number(process.env.E2E_PORT ?? 4317);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    launchOptions: { executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] },
    viewport: { width: 900, height: 1000 },
    locale: 'zh-TW',
  },
  webServer: { command: `pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: false, timeout: 60_000 },
});
