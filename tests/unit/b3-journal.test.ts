import { describe, it, expect } from 'vitest';
import { parseJournal, setEntry, entries, journalKey } from '../../src/ui/logic/journal.ts';
describe('b3 journal', () => {
  it('parses safely and drops junk', () => {
    expect(parseJournal(null)).toEqual({}); expect(parseJournal('nope')).toEqual({}); expect(parseJournal('[1]')).toEqual({});
    expect(parseJournal('{"3":"hi","x":"no","4":5}')).toEqual({ 3: 'hi' });
  });
  it('set / clear / sort entries', () => {
    let j = setEntry({}, 30, '  wed  '); j = setEntry(j, 5, 'kid'); expect(entries(j)).toEqual([{ age: 5, text: 'kid' }, { age: 30, text: 'wed' }]);
    expect(entries(setEntry(j, 30, ''))).toEqual([{ age: 5, text: 'kid' }]);
  });
  it('key is per life', () => { expect(journalKey('eo', 'abc')).toBe('eo.journal.abc'); });
});
