// monkey-patch Math.random during tests so any use from project code (src/) throws.
// Third-party tooling (eslint deps etc.) may still call it, so we only throw when the
// call originates in this repository's src/ tree.
// eslint-disable-next-line no-restricted-properties -- harness keeps original
const original = Math.random.bind(Math);
// eslint-disable-next-line no-restricted-properties -- the test harness itself
Math.random = () => {
  const stack = new Error().stack ?? '';
  if (/[\\/]src[\\/]/.test(stack.split('\n').slice(2).join('\n')) && !/node_modules/.test(stack.split('\n')[2] ?? '')) {
    throw new Error('Math.random is banned; use seeded streams');
  }
  return original();
};
