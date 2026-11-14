import { esc, t } from './i18n.ts';

export function lifeMapTitle(age: number, line: string): string {
  return `${esc(t('years', { n: age }))} ${esc(line)}`;
}
