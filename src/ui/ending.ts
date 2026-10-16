// Ending sequence (gap-v2 #2): full-screen overlay. Stage 1 replays the life — the year strip scrolls while the portrait
// ages through key moments, one caption each (~2.5 s). Stage 2 is the "lived N years" card with the cause line.
// First skip press arms, second skips; Esc closes. Reduced motion jumps straight to the card.
export interface EndingMoment { portrait: string; caption: string; age: number }
export interface EndingIn {
  years: number[]; portrait: string; captions: string[]; final: string; labels: { arm: string; done: string };
  /** replay frames (portrait at that age + caption); falls back to `captions` with the final portrait */
  moments?: EndingMoment[];
  /** the "lived N years" card */
  lived?: { n: string; label: string; sub: string };
}
export const MOMENT_MS = 2500;
export const LEAD_MS = 1200;
/** total length of the replay before the card shows */
export const endingMs = (moments: number) => LEAD_MS + moments * MOMENT_MS;

export function playEnding(host: HTMLElement, d: EndingIn, onClose: (skipped: boolean) => void): () => void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const moments: EndingMoment[] = d.moments ?? d.captions.map((c) => ({ portrait: d.portrait, caption: c, age: 0 }));
  const ov = document.createElement('div');
  ov.className = 'ending'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.id = 'ending';
  ov.innerHTML = `<div class="strip" aria-hidden="true"><div class="strip-in">${d.years.map((y) => `<span>${y}</span>`).join('')}</div></div>
    <div class="scene" id="end-scene">${moments[0]?.portrait ?? d.portrait}</div>
    <div class="lived" id="end-lived" hidden>${d.lived ? `<b class="serif">${d.lived.n}</b><span>${d.lived.label}</span><small class="mono">${d.lived.sub}</small>` : ''}</div>
    <p class="cap" id="end-cap" aria-live="polite"></p>
    <div class="end-ctl"><button class="ghost" id="end-skip">${d.labels.arm}</button><button class="primary" id="end-done" hidden>${d.labels.done}</button></div>`;
  host.appendChild(ov);
  const q = <T extends HTMLElement>(s: string) => ov.querySelector(s) as T;
  const cap = q('#end-cap'), done = q<HTMLButtonElement>('#end-done'), skip = q<HTMLButtonElement>('#end-skip'), scene = q('#end-scene'), lived = q('#end-lived');
  const timers: number[] = [];
  let armed = false, closed = false;
  const close = (skipped: boolean) => { if (closed) return; closed = true; timers.forEach(clearTimeout); document.removeEventListener('keydown', key); ov.remove(); onClose(skipped); };
  const showFinal = () => {
    scene.innerHTML = d.portrait; scene.classList.add('done');
    if (d.lived) lived.hidden = false;
    cap.textContent = d.final; cap.classList.remove('show'); cap.classList.add('final'); done.hidden = false; skip.hidden = true; done.focus();
  };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
  document.addEventListener('keydown', key);
  skip.addEventListener('click', () => { if (!armed) { armed = true; skip.classList.add('armed'); skip.focus(); return; } close(true); });
  done.addEventListener('click', () => close(false));
  requestAnimationFrame(() => ov.classList.add('in'));
  if (reduce) { showFinal(); return () => close(true); }
  moments.forEach((m, i) => timers.push(window.setTimeout(() => {
    if (i > 0) scene.innerHTML = m.portrait;
    cap.textContent = m.caption; cap.classList.remove('show'); void cap.offsetWidth; cap.classList.add('show');
  }, LEAD_MS + i * MOMENT_MS)));
  timers.push(window.setTimeout(showFinal, endingMs(moments.length)));
  skip.focus();
  return () => close(true);
}
