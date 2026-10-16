// batch 3 #6: event sound cues, synthesised with Web Audio (no files). On by default; toggle stored on device.
// The AudioContext is created lazily on the first cue, which always follows a user gesture (starting a life).
import { cueNotes, type Cue } from './logic/milestones.ts';
import { midiToHz } from './logic/music.ts';

let ctx: AudioContext | null = null;
let enabled = true;
export const setSfx = (on: boolean) => { enabled = on; };
export const sfxOn = () => enabled;
export function playCue(c: Cue): void {
  if (!enabled || typeof AudioContext === 'undefined') return;
  try { ctx ??= new AudioContext(); } catch { return; }
  const beat = 0.14, t0 = ctx.currentTime + 0.02;
  const out = ctx.createGain(); out.gain.value = 0.12; out.connect(ctx.destination);
  for (const [m, at, dur] of cueNotes(c)) {
    const o = ctx.createOscillator(), g = ctx.createGain(); const s = t0 + at * beat, e = s + dur * beat * 1.6;
    o.type = c === 'sad' ? 'sine' : 'triangle'; o.frequency.value = midiToHz(m);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.8, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, e);
    o.connect(g); g.connect(out); o.start(s); o.stop(e + 0.05);
  }
}
