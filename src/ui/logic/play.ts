// P2–P4 play controls: speeds, keyboard, auto-choice countdown, skip-to-next-decision.
export const SPEEDS = [1, 2, 4, 8, 12, 16] as const;
export type Speed = (typeof SPEEDS)[number];
export const SKIP_SPEED = 24;
/** keys "1".."6" → speed */
export const speedForKey = (k: string): Speed | null => { const i = Number(k) - 1; return Number.isInteger(i) && i >= 0 && i < SPEEDS.length ? SPEEDS[i]! : null; };
/** auto-choice countdown (s): clamp(textLength / 9, 5, 14) ÷ speed, at least 0.35 s */
export const autoCountdownSec = (textLen: number, speed: number) => Math.max(0.35, Math.min(14, Math.max(5, textLen / 9)) / Math.max(1, speed));
/** events that stop "skip to next decision" */
export const TRAGIC_EVENTS = new Set(['fl_parent_dies', 'illness', 'divorce', 'jobless_year', 'foreclosure', 'loanDefault', 'marginCall', 'fl_pet_dies']);
