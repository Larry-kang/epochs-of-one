// batch 3 #6: milestone toasts and their sound cues (pure). Cues are short generated note patterns (no audio files).
export type Cue = 'joy' | 'big' | 'sad';
export const MILESTONES: Record<string, Cue> = {
  graduated: 'big', first_paycheck: 'joy', promotion: 'joy', ch_marry_marry: 'big', wedding: 'big', ch_child_have: 'big', retire: 'big', windfall: 'joy',
  fl_parent_dies: 'sad', ev_grandparent_dies: 'sad', fl_pet_dies: 'sad', ev_old_classmate_dies: 'sad', illness: 'sad', jobless_year: 'sad', divorce: 'sad',
};
/** milestones among a year's events, in order, at most `max` */
export const milestonesIn = (ids: readonly string[], max = 3): { id: string; cue: Cue }[] =>
  ids.filter((id) => id in MILESTONES).slice(0, max).map((id) => ({ id, cue: MILESTONES[id]! }));
/** the note pattern for a cue: [midi, startBeat, beats] — joy = rising major arpeggio, big = fanfare fifths, sad = falling minor */
export function cueNotes(c: Cue): [number, number, number][] {
  if (c === 'joy') return [[72, 0, 0.5], [76, 0.5, 0.5], [79, 1, 1]];
  if (c === 'big') return [[67, 0, 0.5], [74, 0.5, 0.5], [79, 1, 0.5], [86, 1.5, 1.5]];
  return [[69, 0, 1], [65, 1, 1], [62, 2, 2]];
}
