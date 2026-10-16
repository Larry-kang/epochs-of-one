import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/focus-mc.test.ts'], setupFiles: ['tests/setup.ts'], testTimeout: 3_600_000 } });
