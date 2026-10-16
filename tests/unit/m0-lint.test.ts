import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

describe('M0: ESLint bans Math.random', () => {
  it('reports Math.random usage', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [res] = await eslint.lintText('export const x = Math.random();\n', { filePath: 'src/engine/bad.ts' });
    const ids = res!.messages.map((m) => m.ruleId);
    expect(ids).toContain('no-restricted-properties');
  });
  it('accepts clean code', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [res] = await eslint.lintText('export const x = Math.sqrt(4);\n', { filePath: 'src/engine/ok.ts' });
    expect(res!.errorCount).toBe(0);
  });
  it('Math.random throws when called from src/ at test time', async () => {
    const { callBanned } = await import('../../src/engine/testing/bannedProbe.ts');
    expect(() => callBanned()).toThrow(/banned/);
  });
});
