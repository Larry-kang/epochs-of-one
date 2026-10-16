// Batch 2 music player: Web Audio synthesis of the generated phrase (src/ui/logic/music.ts). Off by default; the
// toggle is a user gesture, so no autoplay. Works offline; nothing is downloaded.
import { CHORDS, midiToHz, phrase } from './logic/music.ts';

let ctx: AudioContext | null = null; let timer = 0;
export const musicOn = () => ctx !== null;
export function startMusic(seed = 1): void {
  if (ctx || typeof AudioContext === 'undefined') return;
  ctx = new AudioContext();
  const master = ctx.createGain(); master.gain.value = 0.18; master.connect(ctx.destination);
  const beat = 0.6; let bar = 0; let k = seed;
  const tone = (hz: number, at: number, dur: number, vel: number, type: OscillatorType) => {
    const o = ctx!.createOscillator(), g = ctx!.createGain();
    o.type = type; o.frequency.value = hz; g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vel, at + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + 0.05);
  };
  const schedule = () => {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.1;
    for (const m of CHORDS[bar % CHORDS.length]!) tone(midiToHz(m), t0, beat * 4, 0.05, 'sine');
    let tt = t0; for (const n of phrase(k++, 4)) { if (tt - t0 >= beat * 4) break; if (n.midi !== null) tone(midiToHz(n.midi), tt, beat * n.beats * 0.9, n.vel, 'triangle'); tt += beat * n.beats; }
    bar++;
  };
  schedule(); timer = window.setInterval(schedule, beat * 4 * 1000);
}
export function stopMusic(): void { clearInterval(timer); void ctx?.close(); ctx = null; }
