import { describe, it, expect, vi } from 'vitest';
import { watchForUpdate, applyUpdate, type SwLike } from '../../src/ui/update.ts';

const mkSw = (state = 'installing') => { const ls: (() => void)[] = []; const w = { state, msgs: [] as unknown[], postMessage(m: unknown) { w.msgs.push(m); }, addEventListener(_t: 'statechange', f: () => void) { ls.push(f); }, set(s: string) { w.state = s; ls.forEach((f) => f()); } }; return w; };
const mkCont = (controller: unknown) => { const ls: (() => void)[] = []; return { controller, addEventListener(_t: 'controllerchange', f: () => void) { ls.push(f); }, fire() { ls.forEach((f) => f()); } }; };

describe('v090 update prompt', () => {
  it('fires for an already-waiting worker when the page is controlled', () => {
    const w = mkSw('installed'); const on = vi.fn();
    watchForUpdate({ waiting: w, installing: null, addEventListener() {} }, mkCont({}), on);
    expect(on).toHaveBeenCalledWith(w);
  });
  it('fires once when a new worker reaches installed; never on first install (no controller)', () => {
    let uf = () => {}; const w = mkSw(); const reg = { waiting: null, installing: w as SwLike | null, addEventListener(_t: 'updatefound', f: () => void) { uf = f; } };
    const on = vi.fn(); watchForUpdate(reg, mkCont({}), on); uf(); w.set('installed'); w.set('installed');
    expect(on).toHaveBeenCalledTimes(1);
    const on2 = vi.fn(); const w2 = mkSw(); let uf2 = () => {};
    watchForUpdate({ waiting: null, installing: w2, addEventListener(_t, f) { uf2 = f; } }, mkCont(null), on2); uf2(); w2.set('installed');
    expect(on2).not.toHaveBeenCalled();
  });
  it('saves before skipWaiting and reloads exactly once on controllerchange (fallback timer does not reload twice)', () => {
    vi.useFakeTimers();
    const order: string[] = []; const w = mkSw('installed'); const c = mkCont({});
    w.postMessage = (m) => order.push('msg:' + (m as { type: string }).type);
    const reload = vi.fn(() => order.push('reload'));
    applyUpdate(w, c, () => order.push('save'), reload, 1000);
    c.fire(); vi.advanceTimersByTime(2000);
    expect(order).toEqual(['save', 'msg:SKIP_WAITING', 'reload']);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
