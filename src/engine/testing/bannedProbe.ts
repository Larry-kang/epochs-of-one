// Test probe only: proves the test harness rejects Math.random from src/. Never imported by app code.
export function callBanned(): number {
  // eslint-disable-next-line no-restricted-properties -- intentional, exercised by tests/unit/m0-lint.test.ts
  return Math.random();
}
