import { describe, it, expect } from 'vitest';
import { milestonesIn, cueNotes, MILESTONES } from '../../src/ui/logic/milestones.ts';
describe('b3 milestones', () => {
  it('picks milestones in order, capped', () => {
    expect(milestonesIn(['ev_x', 'graduated', 'fl_parent_dies'])).toEqual([{ id: 'graduated', cue: 'big' }, { id: 'fl_parent_dies', cue: 'sad' }]);
    expect(milestonesIn(Object.keys(MILESTONES)).length).toBe(3);
    expect(milestonesIn([])).toEqual([]);
  });
  it('cues: joy rises, sad falls', () => {
    const j = cueNotes('joy').map((n) => n[0]); const s = cueNotes('sad').map((n) => n[0]);
    expect(j).toEqual([...j].sort((a, b) => a - b)); expect(s).toEqual([...s].sort((a, b) => b - a));
  });
});
