import { describe, it, expect } from 'vitest';
import { logMore } from '../../src/ui/logic/play.ts';

describe('B2 log "show earlier" button', () => {
  it('is hidden and never negative when there are few years', () => {
    for (const n of [0, 1, 5, 8]) { const m = logMore(n, 8, false); expect(m.hidden).toBe(true); expect(m.earlier).toBe(0); }
  });
  it('counts the hidden years', () => { expect(logMore(23, 8, false)).toEqual({ hidden: false, earlier: 15, expanded: false }); });
  it('stays visible to collapse when expanded', () => { expect(logMore(23, 8, true).hidden).toBe(false); });
});
