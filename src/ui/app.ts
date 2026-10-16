// Single-page UI: intro → setup → birth → life → death (+ about). Vanilla TS, no framework.
import { APP, NOW_YEAR, ENGINE_VERSION } from '../config.ts';
import { loadIndex, preloadDemography, bundle, loadFinance } from './data.ts';
import { t, eventText, esc, countryName, money, pctText } from './i18n.ts';
import { lineChart } from './charts.ts';
import { drawBirth, newLife, advanceYear, applyAction, decisionQuote, tableFor, type LifeConfig, type Era } from '../engine/life/sim.ts';
import type { Action, LifeState } from '../engine/life/state.ts';
import { available, INVEST_ASSETS, type InvestAsset } from '../engine/finance/access.ts';
import type { PriceAsset } from '../engine/finance/returns.ts';
import { investedValue } from '../engine/finance/portfolio.ts';
import { lifeExpectancy } from '../engine/demography/lifeTable.ts';
import { contentEvents } from '../engine/content/registry.ts';
import { companions, ranks, summarize } from '../engine/life/companions.ts';
import { seedFromBytes, SEED_RE } from '../engine/rng/streams.ts';
import { PARAMS } from '../engine/params.ts';
import { loadSave, writeSave, clearSave, pastLives, addPastLife, storageAvailable } from '../storage/save.ts';
import type { CountryIndex } from '../engine/data/types.ts';

const SPEEDS = [1, 2, 4, 8] as const;
type Speed = (typeof SPEEDS)[number];

interface Run { s: LifeState; cfg: LifeConfig; paceMin: 30 | 60 | 90; speed: Speed; paused: boolean; acc: number; yearSec: number; raf: number; last: number }
let run: Run | null = null;
let bridgePrompted = -1;
let root: HTMLElement;
let index: CountryIndex;

export async function start(el: HTMLElement): Promise<void> {
  root = el;
  document.title = APP.title;
  index = await loadIndex();
  await loadFinance();
  intro();
}

function view(html: string, focusSel = 'h1'): void {
  if (run) { cancelAnimationFrame(run.raf); }
  root.innerHTML = html;
  (root.querySelector(focusSel) as HTMLElement | null)?.focus();
}
const header = (sub = '') => `<header class="top"><span class="brand">${esc(APP.title)}</span>${sub}</header>`;
const nameOf = (iso: string) => { const c = index.countries.find((x) => x.iso === iso); return c ? countryName(c.iso2, c.name) : iso; };

// ---------- intro
function intro(): void {
  const save = loadSave();
  const lives = pastLives();
  view(`${header()}
<section class="card intro">
  <h1 tabindex="-1">${esc(APP.title)}</h1>
  <p class="sub">${esc(APP.subtitle)}</p>
  <p>${esc(t('tagline'))}</p>
  <div class="row">
    <button id="go" class="primary">${esc(t('start'))}</button>
    ${save ? `<button id="cont">${esc(t('continue'))}</button>` : ''}
    <button id="about" class="link">${esc(t('about'))}</button>
  </div>
  ${storageAvailable() ? '' : `<p class="warn">${esc(t('storageOff'))}</p>`}
  <h2>${esc(t('pastLives'))}</h2>
  ${lives.length ? `<ul class="past">${lives.map((l) => `<li>${esc(l.name)} · ${l.year} 年生 · ${l.age} 歲 · ${money(l.netWorth)} <code>${esc(l.seed)}</code></li>`).join('')}</ul>` : `<p class="muted">${esc(t('noPast'))}</p>`}
</section>`);
  on('#go', setup);
  on('#cont', () => { if (save) void resume(save); });
  on('#about', about);
}

function about(): void {
  view(`${header()}
<section class="card"><h1 tabindex="-1">${esc(t('aboutTitle'))}</h1>
<p>${esc(t('aboutBody'))}</p>
<p>${esc(t('aboutData'))}</p>
<p id="markets-sources">${esc(t('aboutMarkets'))}</p>
<p id="markets-sources-2">${esc(t('aboutMarkets2'))}</p>
<p id="m5-sources">${esc(t('aboutM5'))}</p>
<p>${esc(t('aboutOffline'))}</p>
<p class="muted">${esc(t('money'))} ${esc(t('estNote'))}</p>
<p class="muted">engine ${ENGINE_VERSION} · data ${esc(index.dataVersion)}</p>
<button id="back">${esc(t('back'))}</button></section>`);
  on('#back', intro);
}

// ---------- setup
function setup(): void {
  view(`${header()}
<section class="card"><h1 tabindex="-1">${esc(t('setupTitle'))}</h1>
<form id="f" novalidate>
  <fieldset><legend>${esc(t('era'))}</legend>
    <label><input type="radio" name="era" value="now" checked> ${esc(t('eraNow'))}（${NOW_YEAR}）</label>
    <label><input type="radio" name="era" value="past-random"> ${esc(t('eraPastRandom'))}</label>
    <label><input type="radio" name="era" value="past-year"> ${esc(t('eraPastYear'))}</label>
    <label class="inline">${esc(t('year'))} <input type="number" name="year" min="${index.birthYears[0]}" max="${NOW_YEAR - 1}" value="1990" inputmode="numeric"></label>
  </fieldset>
  <fieldset><legend>${esc(t('pace'))}</legend>
    ${[30, 60, 90].map((m) => `<label><input type="radio" name="pace" value="${m}" ${m === 60 ? 'checked' : ''}> ${esc(t('paceMin', { n: m }))}</label>`).join('')}
  </fieldset>
  <label class="block">${esc(t('seed'))} <input name="seed" maxlength="64" autocomplete="off" placeholder="${esc(t('seedHint'))}"></label>
  <ul class="errors" id="errs" role="alert"></ul>
  <div class="row"><button class="primary" id="draw" type="submit">${esc(t('drawBirth'))}</button><button type="button" id="back">${esc(t('back'))}</button></div>
</form></section>`);
  on('#back', intro);
  (root.querySelector('#f') as HTMLFormElement).addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const errs: string[] = [];
    const eraV = String(fd.get('era'));
    const yr = Number(fd.get('year'));
    let era: Era = { kind: 'now' };
    if (eraV === 'past-random') era = { kind: 'past', year: 'random' };
    if (eraV === 'past-year') {
      if (!Number.isInteger(yr) || yr < index.birthYears[0] || yr > NOW_YEAR - 1) errs.push(`出生年需為 ${index.birthYears[0]}–${NOW_YEAR - 1} 的整數`);
      era = { kind: 'past', year: yr };
    }
    let seed = String(fd.get('seed') ?? '').trim();
    if (seed && !SEED_RE.test(seed)) errs.push('種子格式不正確：' + t('seedHint'));
    if (!seed) seed = seedFromBytes(crypto.getRandomValues(new Uint8Array(10)));
    const pace = Number(fd.get('pace')) as 30 | 60 | 90;
    const ul = root.querySelector('#errs')!;
    ul.innerHTML = errs.map((x) => `<li>${esc(x)}</li>`).join('');
    if (errs.length) return;
    void birth({ seed, era, nowYear: NOW_YEAR, engineVersion: ENGINE_VERSION }, pace);
  });
}

// ---------- birth
async function birth(cfg: LifeConfig, paceMin: 30 | 60 | 90): Promise<void> {
  const b = drawBirth(index, cfg);
  if ('infeasible' in b) { alert(b.reason); return; }
  await preloadDemography(b.iso);
  const s = newLife(bundle(), cfg);
  if ('infeasible' in s) { alert(s.reason); return; }
  const e0 = lifeExpectancy(tableFor(bundle(), s));
  const est = (k: string) => (s.born.estimated.includes(k) ? ` <span class="badge">${esc(t('est'))}</span>` : '');
  view(`${header()}
<section class="card birth"><h1 tabindex="-1">${esc(t('birthTitle'))}</h1>
<dl class="facts">
  <dt>${esc(t('country'))}</dt><dd id="b-country" dir="auto">${esc(nameOf(s.born.iso))} <small>${s.born.iso}</small></dd>
  <dt>${esc(t('calYear'))}</dt><dd>${s.born.year}</dd>
  <dt>${esc(t('sex'))}</dt><dd>${esc(t(s.born.sex === 'M' ? 'male' : 'female'))}</dd>
  <dt>${esc(t('place'))}</dt><dd>${esc(t(s.born.urban ? 'urban' : 'rural'))}${est('urban')}</dd>
  <dt>${esc(t('quintile'))}</dt><dd>${esc(t(`q${s.born.quintile}` as 'q1'))}</dd>
  <dt>${esc(t('e0'))}</dt><dd>${esc(t('years', { n: e0.toFixed(1) }))}${est('lifeTable')}</dd>
</dl>
<p class="muted">seed <code id="seed">${esc(s.seed)}</code></p>
<div class="row"><button class="primary" id="begin">${esc(t('beginLife'))}</button><button id="back">${esc(t('back'))}</button></div>
</section>`);
  on('#back', setup);
  on('#begin', () => startLife(s, cfg, paceMin, 1));
}

// ---------- life loop
function startLife(s: LifeState, cfg: LifeConfig, paceMin: 30 | 60 | 90, speed: Speed): void {
  const e0 = Math.max(lifeExpectancy(tableFor(bundle(), s)), 60);
  const yearSec = Math.min(Math.max((paceMin * 60) / e0, PARAMS.minYearSec.value), PARAMS.maxYearSec.value);
  run = { s, cfg, paceMin, speed, paused: false, acc: 0, yearSec, raf: 0, last: performance.now() };
  lifeView();
  persist();
  loop();
}

function lifeView(): void {
  const r = run!;
  view(`${header('<span class="sep">·</span><span id="where"></span>')}
<section class="card life">
  <h1 tabindex="-1" class="sr-only">${esc(t('age'))}</h1>
  <div class="hud"><div class="big"><span id="age"></span></div><div id="cal" class="muted"></div><div id="status" class="pill"></div></div>
  <div class="stats" id="stats"></div>
  <div class="money"><div><span class="muted">${esc(t('cash'))}</span><strong id="cash"></strong></div><div><span class="muted">${esc(t('liquid'))}</span><strong id="liq"></strong></div><div><span class="muted">${esc(t('invested'))}</span><strong id="inv"></strong></div><div><span class="muted">${esc(t('houseEq'))}</span><strong id="heq"></strong></div><div><span class="muted">${esc(t('debt'))}</span><strong id="debt"></strong></div><div><span class="muted">${esc(t('income'))}</span><strong id="inc"></strong></div></div>
  <div class="controls" role="group" aria-label="${esc(t('speed'))}">
    <button id="pause">${esc(t('pause'))}</button>
    ${SPEEDS.map((x) => `<button class="spd" data-speed="${x}" aria-pressed="${x === r.speed}">${x}×</button>`).join('')}
    <button id="skip">${esc(t('skip'))}</button>
    <button id="invest">${esc(t('investBtn'))}</button>
    <button id="house">${esc(t('houseBtn'))}</button>
    <button id="loan">${esc(t('loanBtn'))}</button>
    <button id="annuity">${esc(t('annuityBtn'))}</button>
  </div>
  <section id="panel" class="panel" hidden></section>
  <h2>${esc(t('log'))}</h2>
  <ol id="log" class="log" aria-live="polite"></ol>
</section>`, '#pause');
  on('#pause', () => { r.paused = !r.paused; r.last = performance.now(); (root.querySelector('#pause') as HTMLElement).textContent = t(r.paused ? 'resume' : 'pause'); persist(); });
  root.querySelectorAll<HTMLButtonElement>('.spd').forEach((b) => b.addEventListener('click', () => {
    r.speed = Number(b.dataset.speed) as Speed;
    root.querySelectorAll('.spd').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    persist();
  }));
  on('#skip', () => { while (!r.s.death) r.s = advanceYear(bundle(), r.s, contentEvents); persist(); death(); });
  on('#invest', () => investPanel());
  on('#house', () => housePanel());
  on('#loan', () => loanPanel(false));
  on('#annuity', () => annuityPanel());
  renderLife(true);
}

function loop(): void {
  const r = run!;
  r.raf = requestAnimationFrame((now) => {
    const dt = Math.min((now - r.last) / 1000, 1);
    r.last = now;
    if (!r.paused) {
      r.acc += (dt * r.speed) / r.yearSec;
      let steps = 0;
      while (r.acc >= 1 && steps < PARAMS.maxYearsPerFrame.value && !r.s.death) {
        r.s = advanceYear(bundle(), r.s, contentEvents);
        r.acc -= 1; steps++;
      }
      if (steps) { renderLife(false); persist(); }
      if (r.s.death) { death(); return; }
      if (steps && r.s.econ.cash < 0 && bridgePrompted !== r.s.age) {
        bridgePrompted = r.s.age;
        if (decisionQuote(bundle(), r.s).loan.ok) { loanPanel(true); }
      }
    }
    loop();
  });
}

function statusText(s: LifeState): string {
  const y = s.years[s.years.length - 1];
  if (!y || s.age < PARAMS.laborEntryAge.value) return t('child');
  if (!y.inLabor) return y.pension > 0 ? t('retiredPension', { amount: money(y.pension) }) : t('retired');
  return t(y.unemployed ? 'unemployed' : 'employed');
}

function renderLife(full: boolean): void {
  const r = run!; const s = r.s;
  const q = (id: string) => root.querySelector('#' + id) as HTMLElement;
  q('where').textContent = nameOf(s.cur);
  q('age').textContent = t('years', { n: s.age });
  q('cal').textContent = `${t('calYear')} ${s.born.year + s.age}`;
  q('status').textContent = statusText(s);
  q('stats').innerHTML = (['health', 'happy', 'smart', 'social'] as const).map((k) =>
    `<div class="stat"><span>${esc(t(k))}</span><meter min="0" max="100" value="${s.stats[k]}" aria-label="${esc(t(k))}"></meter><b>${s.stats[k]}</b></div>`).join('');
  const last = s.years[s.years.length - 1];
  const estBadge = last && last.est.length ? ` <span class="badge" title="${esc(last.est.join(', '))}">${esc(t('est'))}</span>` : '';
  // live balance sheet from the current state (reflects decisions taken while paused)
  const inv = investedValue(s.portfolio);
  const heq = s.house ? s.house.value - s.house.balance : 0;
  const debt = s.loans.filter((l) => l.status === 'active').reduce((a, l) => a + l.balance, 0) + s.credit.unsecuredDebt;
  q('cash').innerHTML = esc(money(s.econ.cash + inv + heq - debt)) + estBadge;
  q('heq').textContent = money(heq);
  q('debt').textContent = money(debt);
  q('liq').textContent = money(s.econ.cash);
  q('inv').textContent = money(inv);
  q('inc').textContent = money(last?.income ?? 0);
  const log = q('log');
  const items = full ? s.events : s.events.filter((e) => e.age >= s.age - 4);
  if (full) log.innerHTML = '';
  const have = new Set(Array.from(log.children).map((li) => (li as HTMLElement).dataset.k));
  for (const e of items) {
    const k = `${e.age}:${e.id}`;
    if (have.has(k)) continue;
    const li = document.createElement('li');
    li.dataset.k = k;
    const vars = Object.fromEntries(Object.entries(e.vars ?? {}).map(([a, v]) => [a, typeof v === 'number' && /amount|cost|loss|price|pay|pension/.test(a) ? money(v) : v]));
    li.innerHTML = `<span class="la">${e.age} 歲</span> ${esc(eventText(e.id, vars))}`;
    log.prepend(li);
  }
}

// ---------- decisions (M4: allocation). Every decision is a recorded Action → deterministic replay.
const ASSET_LABEL: Record<InvestAsset, Parameters<typeof t>[0]> = { eqHome: 'a_eqHome', eqUS: 'a_eqUS', eqWorld: 'a_eqWorld', gold: 'a_gold', btc: 'a_btc', levEq: 'a_levEq' };
function decide(a: Action): void {
  const r = run!;
  r.s = applyAction(bundle(), r.s, a);
  persist();
  renderLife(false);
}
function investPanel(): void {
  const r = run!; const s = r.s; const m = bundle().markets;
  const panel = root.querySelector('#panel') as HTMLElement;
  if (!m) return;
  const wasPaused = r.paused; r.paused = true;
  const calYear = s.born.year + s.age;
  const tgt = s.portfolio.target;
  const rows = INVEST_ASSETS.map((a) => {
    const av = available(m, a, s.cur, calYear, s.age, { levBase: s.portfolio.levBase, cooldownUntil: s.portfolio.cooldownUntil, frozenUntil: s.credit.frozenUntil });
    const proxy = a === 'eqHome' && !m.eq[s.cur] && s.cur !== 'USA';
    const est = av.est || proxy;
    const v = Math.round((tgt[a] ?? 0) * 100);
    return `<div class="alloc-row"><label for="w-${a}">${esc(t(ASSET_LABEL[a]))}${est ? ` <span class="badge">${esc(t('est'))}</span>` : ''}</label>
      <input type="number" id="w-${a}" data-a="${a}" min="0" max="100" step="5" value="${v}" ${av.ok ? '' : 'disabled'} inputmode="numeric"> %
      ${av.ok ? '' : `<small class="why">${esc(t(('why_' + av.why) as 'why_age'))}</small>`}
      ${a === 'eqHome' && proxy && av.ok ? `<small class="why">${esc(t('proxyWorld'))}</small>` : ''}</div>`;
  }).join('');
  panel.innerHTML = `<h2 tabindex="-1">${esc(t('investTitle', { year: calYear }))}</h2>
    <p class="muted">${esc(t('investHelp'))}</p>
    <div class="alloc">${rows}</div>
    <label class="inline">${esc(t('levBase'))} <select id="lev-base">${(['eqHome', 'eqUS', 'eqWorld'] as PriceAsset[]).map((b) => `<option value="${b}" ${s.portfolio.levBase === b ? 'selected' : ''}>${esc(t(ASSET_LABEL[b as InvestAsset]))}</option>`).join('')}</select></label>
    <p class="warn small">${esc(t('levRisk'))}</p>
    <ul class="errors" id="alloc-errs" role="alert"></ul>
    <div class="row"><button class="primary" id="alloc-ok">${esc(t('apply'))}</button><button id="alloc-cancel">${esc(t('cancel'))}</button></div>`;
  panel.hidden = false;
  (panel.querySelector('h2') as HTMLElement).focus();
  const close = () => { panel.hidden = true; panel.innerHTML = ''; r.paused = wasPaused; r.last = performance.now(); };
  panel.querySelector('#alloc-cancel')!.addEventListener('click', close);
  panel.querySelector('#alloc-ok')!.addEventListener('click', () => {
    const target: Partial<Record<InvestAsset, number>> = {};
    let sum = 0; const errs: string[] = [];
    panel.querySelectorAll<HTMLInputElement>('input[data-a]').forEach((inp) => {
      const v = Number(inp.value);
      if (!Number.isFinite(v) || v < 0 || v > 100) errs.push(t('allocRange'));
      else if (v > 0 && !inp.disabled) { target[inp.dataset.a as InvestAsset] = v / 100; sum += v; }
    });
    if (sum > 100) errs.push(t('allocSum', { n: sum }));
    panel.querySelector('#alloc-errs')!.innerHTML = [...new Set(errs)].map((x) => `<li>${esc(x)}</li>`).join('');
    if (errs.length) return;
    const levBase = (panel.querySelector('#lev-base') as HTMLSelectElement).value as PriceAsset;
    decide({ t: 'alloc', age: s.age, target, levBase });
    close();
  });
}

function openPanel(html: string, onOk: ((panel: HTMLElement) => boolean | void) | null): void {
  const r = run!;
  const panel = root.querySelector('#panel') as HTMLElement;
  const wasPaused = r.paused; r.paused = true;
  const pauseBtn = root.querySelector('#pause') as HTMLElement;
  pauseBtn.textContent = t('resume');
  panel.innerHTML = html + `<ul class="errors" id="p-errs" role="alert"></ul><div class="row">${onOk ? `<button class="primary" id="p-ok">${esc(t('apply'))}</button>` : ''}<button id="p-cancel">${esc(t(onOk ? 'cancel' : 'close'))}</button></div>`;
  panel.hidden = false;
  (panel.querySelector('h2') as HTMLElement | null)?.focus();
  const close = () => { panel.hidden = true; panel.innerHTML = ''; r.paused = wasPaused; r.last = performance.now(); pauseBtn.textContent = t(r.paused ? 'resume' : 'pause'); renderLife(false); };
  panel.querySelector('#p-cancel')!.addEventListener('click', close);
  panel.querySelector('#p-ok')?.addEventListener('click', () => { if (onOk!(panel) !== false) close(); });
}
const pctR = (x: number) => `${(x * 100).toFixed(1)}%`;
const whyText = (k?: string) => (k ? t(('w5_' + k) as 'w5_age') : '');
function housePanel(): void {
  const s = run!.s; const q = decisionQuote(bundle(), s).house;
  if (s.house) {
    const h = s.house;
    openPanel(`<h2 tabindex="-1">${esc(t('houseTitle'))}</h2>
      <dl class="facts"><dt>${esc(t('houseValue'))}</dt><dd id="h-value">${esc(money(h.value))}${h.est ? ` <span class="badge">${esc(t('est'))}</span>` : ''}</dd>
      <dt>${esc(t('mortgageLeft'))}</dt><dd>${esc(money(h.balance))}（${h.termLeft} 年）</dd>
      <dt>${esc(t('sellNet'))}</dt><dd>${esc(money(h.value * (1 - PARAMS.sellCost.value) - h.balance))}</dd></dl>
      <p class="muted">${esc(t('sellHelp'))}</p>`, () => { decide({ t: 'sellHouse', age: s.age }); });
    (root.querySelector('#p-ok') as HTMLElement).textContent = t('sellHouse');
    return;
  }
  openPanel(`<h2 tabindex="-1">${esc(t('houseTitle'))}</h2>
    <dl class="facts"><dt>${esc(t('housePrice'))}</dt><dd id="h-price">${esc(money(q.price))}${q.est ? ` <span class="badge">${esc(t('est'))}</span>` : ''}</dd>
    <dt>${esc(t('downPay'))}</dt><dd>${esc(money(q.down))}</dd>
    <dt>${esc(t('mortgage'))}</dt><dd>${esc(money(q.loan))} · ${PARAMS.mortgageTerm.value} 年 · ${esc(t('floatRate'))} ${pctR(q.rate)}</dd>
    <dt>${esc(t('yearPay'))}</dt><dd>${esc(money(q.pmt))}</dd></dl>
    <p class="muted">${esc(t('houseHelp'))}</p>
    ${q.ok ? '' : `<p class="warn" id="h-why">${esc(whyText(q.why))}</p>`}`, q.ok ? () => { decide({ t: 'buyHouse', age: s.age }); } : null);
  if (q.ok) (root.querySelector('#p-ok') as HTMLElement).textContent = t('buyHouse');
}
function loanPanel(bridge: boolean): void {
  const s = run!.s; const q = decisionQuote(bundle(), s).loan;
  const def = bridge ? Math.min(q.max, Math.ceil(q.bridgeNeed)) : Math.floor(q.max / 2);
  openPanel(`<h2 tabindex="-1">${esc(t(bridge ? 'bridgeTitle' : 'loanTitle'))}</h2>
    ${bridge ? `<p class="prompt" id="bridge-msg">${esc(t('bridgeMsg', { amount: money(q.bridgeNeed) }))}</p>` : ''}
    <dl class="facts"><dt>${esc(t('loanMax'))}</dt><dd id="l-max">${esc(money(q.max))}${q.src === 'proxy' ? ` <span class="badge">${esc(t('est'))}</span>` : ''}</dd>
    <dt>${esc(t('floatRate'))}</dt><dd>${pctR(q.rate)} <span class="badge" title="放款利率＋利差參數">${esc(t('est'))}</span></dd>
    <dt>${esc(t('ruleNote'))}</dt><dd><small>${esc(q.note)}</small></dd></dl>
    ${q.ok ? `<label class="inline">${esc(t('loanAmt'))} <input type="number" id="l-amt" min="1" max="${Math.floor(q.max)}" value="${Math.max(1, def)}" inputmode="numeric"></label>
    <label class="inline">${esc(t('loanTerm'))} <input type="number" id="l-term" min="1" max="7" value="${bridge ? 3 : PARAMS.creditTerm.value}" inputmode="numeric"></label>
    ${bridge ? '' : `<fieldset><legend>${esc(t('loanUse'))}</legend><label><input type="radio" name="l-use" value="cash" checked> ${esc(t('useCash'))}</label><label><input type="radio" name="l-use" value="invest"> ${esc(t('useInvest'))}</label></fieldset>`}
    <p class="warn small">${esc(t('loanRisk'))}</p>` : `<p class="warn" id="l-why">${esc(whyText(q.why))}</p>`}`,
  q.ok ? (panel) => {
    const amt = Number((panel.querySelector('#l-amt') as HTMLInputElement).value), term = Number((panel.querySelector('#l-term') as HTMLInputElement).value);
    const errs: string[] = [];
    if (!(amt > 0) || amt > Math.floor(q.max)) errs.push(t('loanAmtErr', { max: money(q.max) }));
    if (!Number.isInteger(term) || term < 1 || term > 7) errs.push(t('loanTermErr'));
    panel.querySelector('#p-errs')!.innerHTML = errs.map((x) => `<li>${esc(x)}</li>`).join('');
    if (errs.length) return false;
    const use = bridge ? 'bridge' : ((panel.querySelector('input[name=l-use]:checked') as HTMLInputElement).value as 'cash' | 'invest');
    decide({ t: 'loan', age: s.age, amount: amt, term, purpose: use });
    return true;
  } : null);
  if (bridge && q.ok) (root.querySelector('#p-ok') as HTMLElement).textContent = t('bridgeOk');
}
function annuityPanel(): void {
  const s = run!.s; const q = decisionQuote(bundle(), s).annuity;
  openPanel(`<h2 tabindex="-1">${esc(t('annuityTitle'))}</h2>
    <p class="muted">${esc(t('annuityHelp'))}</p>
    ${q.ok ? `<p id="a-rate">${esc(t('annuityRate', { amount: money(q.per1000 * 10) }))}</p>
    <label class="inline">${esc(t('annuityAmt'))} <input type="number" id="a-amt" min="1" max="${Math.floor(q.max)}" value="${Math.floor(q.max / 2)}" inputmode="numeric"></label>` : `<p class="warn" id="a-why">${esc(whyText(q.why))}</p>`}
    ${s.econ.annuity > 0 ? `<p>${esc(t('annuityHave', { amount: money(s.econ.annuity) }))}</p>` : ''}`,
  q.ok ? (panel) => {
    const amt = Number((panel.querySelector('#a-amt') as HTMLInputElement).value);
    if (!(amt > 0) || amt > Math.floor(q.max)) { panel.querySelector('#p-errs')!.innerHTML = `<li>${esc(t('loanAmtErr', { max: money(q.max) }))}</li>`; return false; }
    decide({ t: 'annuity', age: s.age, amount: amt });
    return true;
  } : null);
}

function persist(): void {
  if (!run) return;
  writeSave({ v: 1, cfg: run.cfg, paceMin: run.paceMin, years: run.s.years.length, speed: run.speed, actions: run.s.actions.filter((a) => 'age' in a) });
}

async function resume(sv: NonNullable<ReturnType<typeof loadSave>>): Promise<void> {
  const b = drawBirth(index, sv.cfg);
  if ('infeasible' in b) { clearSave(); intro(); return; }
  await preloadDemography(b.iso);
  let s = newLife(bundle(), sv.cfg);
  if ('infeasible' in s) { clearSave(); intro(); return; }
  const acts = sv.actions ?? [];
  const applyAt = (st: LifeState) => { for (const a of acts) if ('age' in a && a.age === st.age) st = applyAction(bundle(), st, a); return st; };
  for (let i = 0; i < sv.years && !s.death; i++) { s = applyAt(s); s = advanceYear(bundle(), s, contentEvents); }
  if (!s.death) s = applyAt(s);
  if (s.death) { run = { s, cfg: sv.cfg, paceMin: sv.paceMin, speed: 1, paused: true, acc: 0, yearSec: 1, raf: 0, last: 0 }; death(); return; }
  startLife(s, sv.cfg, sv.paceMin, (SPEEDS as readonly number[]).includes(sv.speed) ? (sv.speed as Speed) : 1);
}

// ---------- death / settlement
function death(): void {
  const r = run!; const s = r.s; const d = s.death!;
  cancelAnimationFrame(r.raf);
  const me = summarize(s);
  const peers = companions(bundle(), s, PARAMS.companionsN.value, contentEvents);
  const rk = ranks(me, peers);
  clearSave();
  addPastLife({ id: s.id, seed: s.seed, iso: s.born.iso, name: nameOf(s.born.iso), year: s.born.year, age: d.age, netWorth: me.finalNetWorth, at: s.born.year + d.age });
  const estYears = s.years.filter((y) => y.est.length).length;
  const calls = s.events.filter((e) => e.id === 'marginCall').length;
  const mktEst = s.years.filter((y) => y.est.some((k) => k.startsWith('mkt:'))).length;
  view(`${header()}
<section class="card death"><h1 tabindex="-1">${esc(t('deathTitle'))}</h1>
<p class="lead" id="died">${esc(nameOf(s.born.iso))} · ${esc(t('diedAt', { year: d.year, age: d.age }))} ${esc(t(`cause_${d.cause}` as 'cause_old'))}</p>
<dl class="facts">
  <dt>${esc(t('lifetimeIncome'))}</dt><dd>${esc(money(me.lifetimeIncome))}</dd>
  <dt>${esc(t('finalNetWorth'))}</dt><dd id="nw">${esc(money(me.finalNetWorth))}</dd>
  <dt>${esc(t('pctLifespan'))}</dt><dd>${pctText(rk.lifespan)}</dd>
  <dt>${esc(t('pctIncome'))}</dt><dd>${pctText(rk.lifetimeIncome)}</dd>
  <dt>${esc(t('pctNetWorth'))}</dt><dd id="pct-nw">${pctText(rk.finalNetWorth)}</dd>
  <dt>${esc(t('lifePension'))}</dt><dd id="pen">${esc(money(s.years.reduce((a, y) => a + y.pension, 0)))}</dd>
  ${s.credit.defaults ? `<dt>${esc(t('defaults'))}</dt><dd id="defaults">${s.credit.defaults}</dd>` : ''}
  ${s.actions.some((a) => a.t === 'alloc') ? `<dt>${esc(t('marginCalls'))}</dt><dd id="calls">${calls}</dd><dt>${esc(t('mktEstYears'))}</dt><dd>${mktEst}</dd>` : ''}
</dl>
<p class="muted">比較對象：同國、同年出生的 ${peers.length} 段模擬人生。${estYears ? `其中 ${estYears} 年使用了推估資料。` : ''}</p>
${lineChart(s.years.map((y) => y.netWorth), { label: t('chartNetWorth'), color: '#1C4532' })}
${s.years.some((y) => y.debt > 0) ? lineChart(s.years.map((y) => y.debt), { label: t('chartDebt'), color: '#C0392B' }) : ''}
${lineChart(s.years.map((y) => y.income), { label: t('chartIncome'), color: '#C9A227' })}
<p class="muted">${esc(t('money'))}</p>
<p class="muted">seed <code id="seed">${esc(s.seed)}</code> <button id="copy" class="link">${esc(t('copySeed'))}</button></p>
<div class="row"><button class="primary" id="again">${esc(t('again'))}</button><button id="home">${esc(t('home'))}</button></div>
</section>`);
  on('#again', setup);
  on('#home', intro);
  on('#copy', () => { void navigator.clipboard?.writeText(s.seed).then(() => { (root.querySelector('#copy') as HTMLElement).textContent = t('copied'); }); });
  run = null;
}

function on(sel: string, fn: () => void): void {
  root.querySelector(sel)?.addEventListener('click', fn);
}
