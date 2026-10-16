// Batch 2 X5/H10: background music is generated in code (no audio files) — pure pattern logic is deterministic.
import { describe, it, expect } from 'vitest';
import { PENTATONIC, phrase, midiToHz, CHORDS } from '../../src/ui/logic/music.ts';

describe('B2 generated music', () => {
  it('phrases are deterministic per seed and stay on the pentatonic scale', () => {
    expect(phrase(7, 16)).toEqual(phrase(7, 16));
    expect(phrase(7, 16)).not.toEqual(phrase(8, 16));
    for (const n of phrase(3, 64)) if (n.midi !== null) expect(PENTATONIC).toContain(n.midi % 12);
  });
  it('notes are soft and short enough for a background loop', () => {
    for (const n of phrase(1, 64)) { expect(n.vel).toBeLessThanOrEqual(0.25); expect(n.beats).toBeGreaterThan(0); }
  });
  it('maps MIDI to frequency (A4 = 440 Hz) and has a chord loop', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6); expect(midiToHz(57)).toBeCloseTo(220, 6);
    expect(CHORDS.length).toBeGreaterThanOrEqual(4);
  });
});
