import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tools/l1/*.test.ts'], setupFiles: ['tests/setup.ts'], testTimeout: 3_600_000 } });
