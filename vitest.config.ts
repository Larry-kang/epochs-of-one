import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/property/**/*.test.ts', 'tests/golden/**/*.test.ts', 'tests/calibration/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 120000,
  },
});
