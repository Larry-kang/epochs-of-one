// E1 final-moments sequence: full-screen dark overlay, scrolling year strip, the pixel portrait drawing in,
// captioned key moments (~2.5 s each), then cause + age. First skip press arms, second skips; Esc closes.
export interface EndingIn { years: number[]; portrait: string; captions: string[]; final: string; labels: { arm: string; done: string } }

export function playEnding(host: HTMLElement, d: EndingIn, onClose: (skipped: boolean) => void): () => void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const ov = document.createElement('div');
  ov.className = 'ending'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.id = 'ending';
  ov.innerHTML = `<div class="strip" aria-hidden="true"><div class="strip-in">${d.years.map((y) => `<span>${y}</span>`).join('')}</div></div>
    <div class="scene">${d.portrait}</div><p class="cap" id="end-cap" aria-live="polite"></p>
    <div class="end-ctl"><button class="ghost" id="end-skip">${d.labels.arm}</button><button class="primary" id="end-done" hidden>${d.labels.done}</button></div>`;
  host.appendChild(ov);
  const cap = ov.querySelector('#end-cap') as HTMLElement, done = ov.querySelector('#end-done') as HTMLButtonElement, skip = ov.querySelector('#end-skip') as HTMLButtonElement;
  const timers: number[] = [];
  let armed = false, closed = false;
  const close = (skipped: boolean) => { if (closed) return; closed = true; timers.forEach(clearTimeout); document.removeEventListener('keydown', key); ov.remove(); onClose(skipped); };
  const showFinal = () => { cap.textContent = d.final; cap.classList.add('final'); done.hidden = false; skip.hidden = true; done.focus(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
  document.addEventListener('keydown', key);
  skip.addEventListener('click', () => { if (!armed) { armed = true; skip.classList.add('armed'); skip.focus(); return; } close(true); });
  done.addEventListener('click', () => close(false));
  requestAnimationFrame(() => ov.classList.add('in'));
  if (reduce) { showFinal(); return () => close(true); }
  d.captions.forEach((c, i) => timers.push(window.setTimeout(() => { cap.textContent = c; cap.classList.remove('show'); void cap.offsetWidth; cap.classList.add('show'); }, 1200 + i * 2500)));
  timers.push(window.setTimeout(showFinal, 1200 + d.captions.length * 2500));
  skip.focus();
  return () => close(true);
}
