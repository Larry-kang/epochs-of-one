// v0.9.0: "new version — refresh" prompt. A new service worker installs and waits; the page offers a non-blocking banner.
// Refresh = save the current life first, then ask the waiting worker to take over and reload once it controls the page.
export interface SwLike { state: string; postMessage(m: unknown): void; addEventListener(t: 'statechange', f: () => void): void }
export interface RegLike { waiting: SwLike | null; installing: SwLike | null; addEventListener(t: 'updatefound', f: () => void): void }
export interface ContainerLike { controller: unknown; addEventListener(t: 'controllerchange', f: () => void): void }

/** Calls onWaiting once when an update is installed and waiting (only when a worker already controls the page). */
export function watchForUpdate(reg: RegLike, sw: ContainerLike, onWaiting: (w: SwLike) => void): void {
  let fired = false;
  const fire = (w: SwLike) => { if (!fired && sw.controller) { fired = true; onWaiting(w); } };
  if (reg.waiting) fire(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const n = reg.installing; if (!n) return;
    n.addEventListener('statechange', () => { if (n.state === 'installed') fire(n); });
  });
}

/** Save first (never lose progress), then activate the waiting worker and reload exactly once. */
export function applyUpdate(w: SwLike, sw: ContainerLike, save: () => void, reload: () => void, fallbackMs = 4000): void {
  save();
  let done = false;
  const go = () => { if (!done) { done = true; reload(); } };
  sw.addEventListener('controllerchange', go);
  w.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(go, fallbackMs); // the worker may already be gone/activated; the save is on disk either way
}
