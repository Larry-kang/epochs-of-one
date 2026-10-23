import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tools/l2/*.test.ts'], setupFiles: ['tests/setup.ts'], testTimeout: 7_200_000 } });
