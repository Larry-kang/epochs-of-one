// Single-page UI (batch 1 layout): home → roll → birth record → play → final moments → death record (+ about).
// Vanilla TS, no framework. All copy lives in the one translation table src/content/i18n/table.json.
import { APP, NOW_YEAR, ENGINE_VERSION, BTC_FUTURE_DAMPENED } from '../config.ts';
import { loadIndex, preloadDemography, bundle, loadFinance, loadWpp, wppLoaded } from './data.ts';
import { wppAt } from '../engine/life/fertility.ts';
import { t, tMaybe, compact, locale, LANGS, LANG_NAMES, getLang, setLang, type Lang, eventText, esc, contentLangAttr, countryName, money, pctText } from './i18n.ts';
import { lineChart } from './charts.ts';
import { drawBirth, newLife, advanceYear, applyAction, decisionQuote, tableFor, pendingOffers, MORTGAGE_TERMS, type LifeConfig } from '../engine/life/sim.ts';
import { ending } from '../engine/life/ending.ts';
import { seriesAt } from '../engine/data/types.ts';
import { defaultPick, minorById, type ChoiceOffer } from '../engine/life/choices.ts';
import type { Action, LifeState } from '../engine/life/state.ts';
import { available, INVEST_ASSETS, type InvestAsset } from '../engine/finance/access.ts';
import { LAST_DATA_YEAR, type PriceAsset } from '../engine/finance/returns.ts';
import { investedValue } from '../engine/finance/portfolio.ts';
import { lifeExpectancy } from '../engine/demography/lifeTable.ts';
import { contentEvents } from '../engine/content/registry.ts';
import { ITEMS, itemById, itemState, lifestyleAt, LIFESTYLE, ROUTINES, spendOpen, situationSort, sellState, owned, heavyDebt, parentOld, autoHabits, bondOf, type Item } from '../engine/life/spend.ts';
import { sameSecondConfigs, sameSecond, statusAt } from '../engine/life/sameSecond.ts';
import { startMusic, stopMusic, musicOn } from './music.ts';
import { focusStage, chipsFor, activeAlloc, mapToStage, weights, focusEffects, autoAlloc, type Stage } from '../engine/life/focus.ts';
import { companions, ranks, summarize } from '../engine/life/companions.ts';
import { seedFromBytes, SEED_RE } from '../engine/rng/streams.ts';
import { PARAMS } from '../engine/params.ts';
import { loadSave, writeSave, clearSave, pastLives, addPastLife, storageAvailable, type PastLife } from '../storage/save.ts';
import type { CountryIndex } from '../engine/data/types.ts';
import { birthShares, allShares, sharePct } from './logic/odds.ts';
import { ERA_CHOICES, resolveEra, oddsRange, type EraChoice } from './logic/era.ts';
import { rollIntervals, rollSequence } from './logic/roll.ts';
import { registryNo, folioLines } from './logic/cert.ts';
import { SPEEDS, SKIP_SPEED, speedForKey, autoCountdownSec, TRAGIC_EVENTS, logMore, DEFAULT_PACE_MIN, bornBy, revealStepMs, type Speed } from './logic/play.ts';
import { portraitSvg } from './logic/portrait.ts';
import { factFor } from './logic/facts.ts';
import { drawShareCard, type ShareCard } from './share.ts';
import { playEnding, type EndingIn } from './ending.ts';
import { seeOff, hobbies, visited, memorable, type Mourner } from './logic/epilogue.ts';
import { sceneSpec, sceneSvg } from './logic/scene.ts';
import { parseTheme, nextTheme } from './logic/theme.ts';
import { journalKey, parseJournal, setEntry, entries } from './logic/journal.ts';
import { milestonesIn } from './logic/milestones.ts';
import { playCue, setSfx, sfxOn } from './sfx.ts';

interface Run { s: LifeState; cfg: LifeConfig; paceMin: 30 | 60 | 90; speed: Speed; paused: boolean; acc: number; yearSec: number; raf: number; last: number; skipping: boolean }
let run: Run | null = null;
let bridgePrompted = -1;
let nudged = new Set<string>();
let root: HTMLElement;
let index: CountryIndex;
let choiceResume = false;
let autoTimer = 0;
const starred = new Set<string>();
let logAll = false;
const K_AUTO = `${APP.storagePrefix}.auto.v1`, K_SPEED = `${APP.storagePrefix}.speed.v1`;
const pref = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const autoOn = () => pref.get(K_AUTO) === '1';
const K_THEME = `${APP.storagePrefix}.theme.v1`;
const theme = () => parseTheme(pref.get(K_THEME));
function applyTheme(): void { const v = theme(); if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = v; }
applyTheme();
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const home = { era: 'now' as EraChoice, year: 'random' as number | 'random', pace: DEFAULT_PACE_MIN as 30 | 60 | 90 };
const pageOpened = performance.now();

export async function start(el: HTMLElement): Promise<void> {
  root = el;
  document.title = APP.title;
  document.documentElement.lang = getLang();
  index = await loadIndex();
  await loadFinance();
  document.addEventListener('keydown', onKey);
  intro();
}

function view(html: string, focusSel = 'h1'): void {
  if (run) { cancelAnimationFrame(run.raf); }
  clearTimeout(autoTimer);
  root.innerHTML = html;
  (root.querySelector(focusSel) as HTMLElement | null)?.focus();
}
const header = (sub = '') => `<header class="top"><span class="brand">${esc(APP.title)}</span>${sub}</header>`;
const nameOf = (iso: string) => { const c = index.countries.find((x) => x.iso === iso); return c ? countryName(c.iso2, c.name) : iso; };
const fmtThousands = (k: number) => compact(k);

// ---------- home (H1, H4–H6, H8, H9, H11, X4)
function intro(): void {
  const save = loadSave();
  const lives = pastLives();
  const [b0] = index.birthYears;
  const perSec = (birthShares(index, NOW_YEAR, NOW_YEAR).total * 1000) / (365.25 * 86400);
  view(`<div class="home">
<section class="hero">
  <p class="mono kicker-line">${esc(t('heroKicker', { ver: ENGINE_VERSION }))}</p>
  <h1 tabindex="-1" class="wordmark" aria-label="${esc(APP.title)}"><span>${esc(t('heroA'))}</span><span>${esc(t('heroB'))}<em>${esc(t('heroC'))}</em></span></h1>
  <p class="hero-intro">${esc(t('heroIntro', { n: perSec.toFixed(1) }))}</p>
  <div class="counters"><div><b id="ctr-born" class="serif">0</b><small>${esc(t('counterBorn'))}</small></div><div><b class="serif">${lives.length}</b><small>${esc(t('counterLives'))}</small></div></div>
</section>
<aside class="odds card" id="odds" aria-live="polite"></aside>
<section class="home-controls">
  <div class="ctl"><span class="lbl mono">${esc(t('eraLabel'))}</span><div class="seg" role="radiogroup" aria-label="${esc(t('eraLabel'))}">${ERA_CHOICES.map((e) => `<button role="radio" data-era="${e}" aria-checked="${e === home.era}">${esc(t(('era_' + e) as 'era_now'))}</button>`).join('')}</div>
    <label class="yearsel" ${home.era === 'past' ? '' : 'hidden'}><span class="sr-only">${esc(t('year'))}</span><select id="year"><option value="random">${esc(t('yearRandom'))}</option>${Array.from({ length: NOW_YEAR - b0 }, (_, i) => NOW_YEAR - 1 - i).map((y) => `<option value="${y}" ${home.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
    <p class="hint" id="era-hint">${esc(t(('eraHint_' + home.era) as 'eraHint_now'))}</p></div>
  <div class="ctl"><span class="lbl mono">${esc(t('paceLabel'))}</span><div class="seg" role="radiogroup" aria-label="${esc(t('paceLabel'))}">${([30, 60, 90] as const).map((m) => `<button role="radio" data-pace="${m}" aria-checked="${m === home.pace}">${esc(t(('pace_' + m) as 'pace_60'))}</button>`).join('')}</div></div>
</section>
<details class="advanced"><summary>${esc(t('advanced'))}</summary>
  <form id="f" novalidate>
  <label class="block">${esc(t('countryPick'))} <select name="country" id="country"><option value="">${esc(t('countryRandom'))}</option>${[...index.countries].map((c) => ({ iso: c.iso, n: nameOf(c.iso) })).sort((a, b) => a.n.localeCompare(b.n, locale())).map((c) => `<option value="${c.iso}">${esc(c.n)}</option>`).join('')}</select></label>
  <p class="muted small">${esc(t('countryNote'))}</p>
  <label class="block">${esc(t('seed'))} <input name="seed" maxlength="64" autocomplete="off" placeholder="${esc(t('seedHint'))}"></label>
  </form>
</details>
<ul class="errors" id="errs" role="alert"></ul>
<div class="cta-row">
  <button class="cta" id="go">${esc(t('bornCta'))} <span aria-hidden="true">→</span></button>
  ${save ? `<button class="ghost" id="cont">${esc(t('continue'))} <small>${esc(t('resumeAt', { n: save.years }))}</small></button>` : ''}
</div>
${storageAvailable() ? '' : `<p class="warn">${esc(t('storageOff'))}</p>`}
<section class="past-lives card"><h2>${esc(t('pastLives'))}</h2>
  ${lives.length ? `<ol class="past">${lives.slice(0, 10).map((l, i) => `<li><button class="link past-open" data-i="${i}" ${l.cfg ? '' : 'disabled'}>${esc(l.name)} · ${l.year}–${l.at} · ${esc(t('years', { n: l.age }))}</button> <span class="mono small">${esc(money(l.netWorth))}</span></li>`).join('')}</ol>` : `<p class="muted">${esc(t('noPast'))}</p>`}
</section>
${getLang() !== 'zh-TW' ? `<p class="muted small content-note">${esc(t('contentNote'))}</p>` : ''}<footer class="foot"><button id="about" class="ghost">${esc(t('about'))}</button>${musicBtn()}${sfxBtn()}${themeBtn()}${langPicker()}<span class="muted small">engine ${ENGINE_VERSION} · data ${esc(index.dataVersion)}</span></footer>
</div>`);
  renderOdds();
  const ctr = root.querySelector('#ctr-born') as HTMLElement;
  const tick = () => { if (!ctr.isConnected) return; ctr.textContent = Math.floor(((performance.now() - pageOpened) / 1000) * perSec).toLocaleString(locale()); setTimeout(tick, 1000); };
  tick();
  root.querySelectorAll<HTMLButtonElement>('[data-era]').forEach((b) => b.addEventListener('click', () => {
    home.era = b.dataset.era as EraChoice;
    root.querySelectorAll('[data-era]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    (root.querySelector('.yearsel') as HTMLElement).hidden = home.era !== 'past';
    (root.querySelector('#era-hint') as HTMLElement).textContent = t(('eraHint_' + home.era) as 'eraHint_now');
    renderOdds();
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-pace]').forEach((b) => b.addEventListener('click', () => {
    home.pace = Number(b.dataset.pace) as 30 | 60 | 90;
    root.querySelectorAll('[data-pace]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  (root.querySelector('#year') as HTMLSelectElement).addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; home.year = v === 'random' ? 'random' : Number(v); renderOdds(); });
  on('#go', submitHome);
  on('#cont', () => { if (save) void resume(save); });
  on('#about', about);
  root.querySelectorAll<HTMLButtonElement>('.past-open').forEach((b) => b.addEventListener('click', () => { const l = lives[Number(b.dataset.i)]; if (l) void reopen(l); }));
}

function renderOdds(): void {
  const box = root.querySelector('#odds') as HTMLElement | null; if (!box) return;
  const [from, to] = oddsRange(home.era, home.year, NOW_YEAR, index.birthYears);
  const o = birthShares(index, from, to);
  const lead = o.rows[0]?.share ?? 1;
  const title = home.era === 'now' ? t('oddsTitleNow') : from === to ? t('oddsTitleYear', { year: from }) : t('oddsTitleRange', { from, to });
  box.innerHTML = `<h2 class="serif">${esc(title)}</h2>
  <p class="mono cap">${esc(t(from > NOW_YEAR ? 'oddsCaptionFuture' : 'oddsCaption', { total: fmtThousands(o.total) }))}</p>
  <ol class="bars">${o.rows.map((r) => `<li><span class="nm">${esc(nameOf(r.iso))}</span><span class="bar"><i style="width:${((r.share / lead) * 100).toFixed(1)}%"></i></span><span class="mono pc">${sharePct(r.share)}</span></li>`).join('')}
  <li class="other"><span class="nm">${esc(t('oddsOther', { n: o.otherN }))}</span><span class="bar"><i style="width:100%"></i></span><span class="mono pc">${sharePct(o.otherShare)}</span></li></ol>
  <button class="ghost small" id="odds-all">${esc(t('oddsAll', { n: o.rows.length + o.otherN }))}</button>`;
  on('#odds-all', () => oddsTable(from, to));
}

function oddsTable(from: number, to: number): void {
  const rows = allShares(index, from, to).map((r) => ({ ...r, gdp: seriesAt(index.countries.find((c) => c.iso === r.iso)!.series.gdpPcPpp, Math.min(to, NOW_YEAR)).v, n: nameOf(r.iso) }));
  const mid = Math.round((from + to) / 2);
  const ext = (iso: (typeof rows)[number]['iso']) => ({ e0: wppAt(wppLoaded(), 'e0', iso, mid) ?? -1, q5: wppAt(wppLoaded(), 'q5', iso, mid) ?? -1 });
  const dlg = document.createElement('dialog'); dlg.className = 'sheet'; dlg.id = 'odds-table';
  let key: 'share' | 'n' | 'gdp' | 'e0' | 'q5' = 'share';
  const draw = () => {
    const rx = rows.map((r) => ({ ...r, ...ext(r.iso) }));
    const sorted = rx.sort((a, b) => (key === 'n' ? a.n.localeCompare(b.n, locale()) : b[key] - a[key]));
    const opt = (v: number, d: number) => (v < 0 ? '—' : v.toFixed(d));
    dlg.innerHTML = `<h2 class="serif">${esc(t('oddsTableTitle'))} <small class="mono">${from === to ? from : `${from}–${to}`}</small></h2>
    <div class="tbl-wrap"><table><thead><tr><th><button class="link" data-k="n">${esc(t('colCountry'))}</button></th><th><button class="link" data-k="share">${esc(t('colShare'))}</button></th><th>${esc(t('colBirths'))}</th><th><button class="link" data-k="gdp">${esc(t('colGdp'))}</button></th><th><button class="link" data-k="e0">${esc(t('colE0'))}</button></th><th><button class="link" data-k="q5">${esc(t('colQ5'))}</button></th></tr></thead>
    <tbody>${sorted.map((r) => `<tr><td>${esc(r.n)}</td><td class="mono">${sharePct(r.share)}</td><td class="mono">${Math.round(r.births).toLocaleString(locale())}</td><td class="mono">${money(r.gdp)}</td><td class="mono">${opt(r.e0, 1)}</td><td class="mono">${opt(r.q5, 0)}</td></tr>`).join('')}</tbody></table></div>
    <p class="mono cap">${esc(t('oddsCaption', { total: fmtThousands(rows.reduce((a, r) => a + r.births, 0)) }))} · ${esc(t('wdiCite'))}</p>
    <div class="row"><button class="primary" id="tbl-close">${esc(t('close'))}</button></div>`;
    dlg.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) => b.addEventListener('click', () => { key = b.dataset.k as typeof key; draw(); }));
    dlg.querySelector('#tbl-close')!.addEventListener('click', () => dlg.close());
  };
  draw();
  if (!wppLoaded()) void loadWpp().then(() => { if (dlg.open) draw(); });
  dlg.addEventListener('close', () => dlg.remove());
  root.appendChild(dlg); dlg.showModal();
}

function submitHome(): void {
  const f = root.querySelector('#f') as HTMLFormElement;
  const fd = new FormData(f);
  const errs: string[] = [];
  let seed = String(fd.get('seed') ?? '').trim();
  if (seed && !SEED_RE.test(seed)) errs.push(t('seedBad') + t('seedHint'));
  (root.querySelector('#errs') as HTMLElement).innerHTML = errs.map((x) => `<li>${esc(x)}</li>`).join('');
  if (errs.length) { (root.querySelector('.advanced') as HTMLDetailsElement).open = true; return; }
  if (!seed) seed = seedFromBytes(crypto.getRandomValues(new Uint8Array(10)));
  const era = resolveEra(home.era, home.year, crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32);
  const iso = String(fd.get('country') ?? '');
  const constraints = iso ? { country: { kind: 'fixed' as const, value: iso }, sex: { kind: 'random' as const }, quintile: { kind: 'random' as const }, urban: { kind: 'random' as const } } : undefined;
  void birth({ seed, era, nowYear: NOW_YEAR, engineVersion: ENGINE_VERSION, ...(constraints ? { constraints } : {}) }, home.pace, true);
}

function about(): void {
  view(`${header()}
<section class="card"><h1 tabindex="-1">${esc(t('aboutTitle'))}</h1>
<p>${esc(t('aboutBody'))}</p>
<p>${esc(t('aboutData'))}</p>
<p id="markets-sources">${esc(t('aboutMarkets'))}</p>
<p id="markets-sources-2">${esc(t('aboutMarkets2'))}</p>
<p id="m5-sources">${esc(t('aboutM5'))}</p>
${BTC_FUTURE_DAMPENED ? `<p id="btc-future-about">${esc(t('aboutBtcFuture'))}</p>` : ''}
<p>${esc(t('aboutOffline'))}</p>
<p class="muted">${esc(t('money'))} ${esc(t('estNote'))}</p>
<p class="muted">engine ${ENGINE_VERSION} · data ${esc(index.dataVersion)}</p>
<button id="back">${esc(t('back'))}</button></section>`);
  on('#back', intro);
}

// ---------- roll (B1) + birth record (B2, B5)
function yearShare(iso: string, year: number): { p: number; one: number } {
  const o = birthShares(index, year, year, Infinity); const r = o.rows.find((x) => x.iso === iso);
  const p = r ? r.share : 0; return { p, one: p > 0 ? Math.round(1 / p) : 0 };
}
async function rollAnim(year: number, iso: string): Promise<void> {
  const o = birthShares(index, year, year, 40);
  const seq = rollSequence(o.rows, iso, () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32);
  const iv = rollIntervals();
  view(`<section class="roll" aria-live="polite"><p class="mono cap">${esc(t('rollCaption'))}</p><h1 tabindex="-1" class="serif roll-name" id="roll-name">&nbsp;</h1><p class="mono" id="roll-p">&nbsp;</p></section>`);
  const el = root.querySelector('#roll-name') as HTMLElement, pe = root.querySelector('#roll-p') as HTMLElement;
  if (reduceMotion()) { el.textContent = nameOf(iso); return; }
  for (let i = 0; i < seq.length; i++) {
    el.textContent = nameOf(seq[i]!);
    await new Promise((r) => setTimeout(r, iv[i]));
  }
  pe.textContent = t('rollProb', { p: sharePct(yearShare(iso, year).p) });
  await new Promise((r) => setTimeout(r, 450));
}

async function birth(cfg: LifeConfig, paceMin: 30 | 60 | 90, animate = false): Promise<void> {
  const b = drawBirth(index, cfg);
  if ('infeasible' in b) { alert(b.reason); return; }
  await preloadDemography(b.iso);
  const s = newLife(bundle(), cfg);
  if ('infeasible' in s) { alert(s.reason); return; }
  if (animate) await rollAnim(s.born.year, s.born.iso);
  const tbl = tableFor(bundle(), s);
  const e0 = lifeExpectancy(tbl);
  const demo = bundle().demography(s.born.iso);
  const q5 = demo.q5.T[Math.min(Math.max(s.born.year - demo.from, 0), demo.q5.T.length - 1)]!;
  const est = (k: string) => (s.born.estimated.includes(k) ? ` <span class="badge">${esc(t('est'))}</span>` : '');
  const yearSec = yearSecFor(s, paceMin);
  const ys = yearShare(s.born.iso, s.born.year);
  const country = nameOf(s.born.iso);
  const gdp = seriesAt(bundle().country(s.born.iso).series.gdpPcPpp, s.born.year).v;
  const dots = '●'.repeat(s.born.quintile) + '○'.repeat(5 - s.born.quintile);
  view(`<div class="cert-page">
<h1 tabindex="-1" class="sr-only">${esc(t('birthTitle'))}</h1>
<article class="cert" id="cert">
  <header class="band"><span class="serif">${esc(t('certTitle'))}</span><span class="mono">${esc(t('certNo', { no: registryNo(s.born.iso, s.born.year, s.seed) }))}</span></header>
  <div class="cert-body">
    <p class="mono lbl">${esc(t('f_name'))}</p>
    <p class="cert-name serif" id="b-name">${esc(s.name.full)}</p>
    <p class="story">${esc(t('certStory', { year: s.born.year, country, place: t(s.born.urban ? 'urban' : 'rural'), sex: t(s.born.sex === 'M' ? 'boy' : 'girl'), q: t(`q${s.born.quintile}` as 'q1'), sib: s.family.siblings.length ? t('certSib', { n: s.family.siblings.length }) : t('certOnly') }))}</p>
    <p class="pace small">${esc(t('certPace', { min: paceMin, sec: yearSec.toFixed(0) }))}</p>
    <dl class="grid">
      <div><dt>${esc(t('f_sex'))}</dt><dd>${esc(t(s.born.sex === 'M' ? 'male' : 'female'))}</dd></div>
      <div><dt>${esc(t('f_country'))}</dt><dd id="b-country" dir="auto">${esc(country)} <small class="mono">${s.born.iso}</small></dd></div>
      <div><dt>${esc(t('f_place'))}</dt><dd>${esc(t(s.born.urban ? 'urban' : 'rural'))}${est('urban')}</dd></div>
      <div><dt>${esc(t('f_parents'))}</dt><dd>${esc(t('parentsAges', { ma: s.born.year - s.family.mother.born, fa: s.born.year - s.family.father.born }))}</dd></div>
      <div><dt>${esc(t('f_quintile'))}</dt><dd><span class="dots" aria-hidden="true">${dots}</span> ${esc(t('quintileOf', { q: s.born.quintile }))}</dd></div>
      <div><dt>${esc(t('familyLabel'))}</dt><dd id="b-family">${esc(t('familyLine', { father: s.family.father.name, fa: s.born.year - s.family.father.born, mother: s.family.mother.name, ma: s.born.year - s.family.mother.born }))}<br>${esc(s.family.siblings.length ? t('siblingsLine', { n: s.family.siblings.length, names: s.family.siblings.map((x) => x.name).join('、') }) : t('siblingsNone'))}</dd></div>
      <div><dt>${esc(t('f_e0'))}</dt><dd>${esc(t('years', { n: e0.toFixed(1) }))}${est('lifeTable')}</dd></div>
      <div><dt>${esc(t('f_q5'))}</dt><dd>${(q5 * 100).toFixed(1)}%</dd></div>
      <div><dt>${esc(t('f_gdp'))}</dt><dd>${esc(money(gdp))}</dd></div>
    </dl>
    <p class="odds-line">${esc(t('certOdds', { p: sharePct(ys.p), country, n: ys.one.toLocaleString(locale()) }))}</p>
    <p class="mono cap">${esc(t('oddsCaption', { total: fmtThousands(birthShares(index, s.born.year, s.born.year).total) }))} · seed <code id="seed">${esc(s.seed)}</code></p>
  </div>
  <footer class="cert-foot"><button class="ghost" id="back" aria-label="${esc(t('home'))}">${esc(t('homeBack'))}</button><button class="ghost" id="reroll">${esc(t('reroll'))}</button><button class="ghost" id="share-birth">${esc(t('shareBirth'))}</button><button class="cta" id="begin">${esc(t('startThis'))} <span aria-hidden="true">→</span></button></footer>
</article></div>`);
  on('#back', intro);
  on('#reroll', () => { void birth({ ...cfg, seed: seedFromBytes(crypto.getRandomValues(new Uint8Array(10))) }, paceMin); });
  on('#share-birth', () => shareSheet({ app: APP.title, title: t('certTitle'), name: s.name.full, span: String(s.born.year), country, cause: t('certOdds', { p: sharePct(ys.p), country, n: ys.one.toLocaleString(locale()) }).split('，')[0]!, facts: [t('f_e0') + ' ' + t('years', { n: e0.toFixed(1) }), t('f_quintile') + ' ' + t('quintileOf', { q: s.born.quintile }), t('f_gdp') + ' ' + money(gdp)], map: [], e0, text: `${s.name.full} · ${country} · ${s.born.year} — ${APP.title}` }));
  on('#begin', () => startLife(s, cfg, paceMin, savedSpeed()));
  stageReveal(savedSpeed());
}
/** reveal the birth card field by field at a pace that follows the speed setting; a click or key shows everything */
function stageReveal(speed: number): void {
  const cert = root.querySelector('#cert') as HTMLElement | null; if (!cert || reduceMotion()) return;
  const items = [...cert.querySelectorAll<HTMLElement>('#b-name, .story, .pace, .grid > div, .odds-line, .cert-body > .cap')];
  items.forEach((el) => el.classList.add('stage-hide'));
  cert.dataset.reveal = 'running';
  const timers: number[] = [];
  const all = () => { timers.forEach(clearTimeout); items.forEach((el) => el.classList.remove('stage-hide')); cert.dataset.reveal = 'done'; document.removeEventListener('keydown', all); };
  const step = revealStepMs(speed);
  items.forEach((el, i) => timers.push(window.setTimeout(() => { el.classList.remove('stage-hide'); if (i === items.length - 1) all(); }, 250 + i * step)));
  cert.addEventListener('click', all, { once: true }); document.addEventListener('keydown', all, { once: true });
}
const savedSpeed = (): Speed => { const v = Number(pref.get(K_SPEED)); return (SPEEDS as readonly number[]).includes(v) ? (v as Speed) : 1; };
function yearSecFor(s: LifeState, paceMin: number): number {
  const e0 = Math.max(lifeExpectancy(tableFor(bundle(), s)), 60);
  return Math.min(Math.max((paceMin * 60) / e0, PARAMS.minYearSec.value), PARAMS.maxYearSec.value);
}

// ---------- play (P1–P4, P6, P7, P10, P11, P13, P16)
function startLife(s: LifeState, cfg: LifeConfig, paceMin: 30 | 60 | 90, speed: Speed): void {
  run = { s, cfg, paceMin, speed, paused: false, acc: 0, yearSec: yearSecFor(s, paceMin), raf: 0, last: performance.now(), skipping: false };
  logAll = false; starred.clear(); sceneKey = '';
  peers = []; void loadPeers(s);
  lifeView();
  persist();
  loop();
}

function lifeView(): void {
  const r = run!;
  nudged = new Set();
  view(`<header class="topbar" id="topbar">
  <div class="tb-left"><span class="tb-mark serif">${esc(APP.name)}</span><span class="tb-who"><span class="tb-age serif" id="age"></span><span class="tb-name" id="tb-name"></span></span>
    <div class="tb-meta"><span class="mono small" id="cal"></span><span class="tb-prog" aria-hidden="true"><i id="yprog"></i></span></div></div>
  <div class="tb-right" role="toolbar" aria-label="${esc(t('speed'))}">
    <button id="pause" class="pill">${esc(t('pause'))}</button>
    <span class="tb-speeds">${SPEEDS.map((x) => `<button class="pill spd" data-speed="${x}" aria-pressed="${x === r.speed}">${x}×</button>`).join('')}</span>
    <button class="pill tb-cur" id="spd-cycle" aria-label="${esc(t('speed'))}">${r.speed}×</button>
    <button class="pill" id="skip-dec">${esc(t('skipDecision'))} »</button>
    <button class="pill" id="auto" aria-pressed="${autoOn()}">${esc(t('autoLabel'))}</button>
    ${musicBtn()}<span class="menu-wrap"><button class="pill" id="more" aria-haspopup="true" aria-expanded="false" aria-label="${esc(t('moreMenu'))}">⋯</button>
      <span class="menu" id="menu" hidden><button id="skip">${esc(t('skip'))}</button><button id="auto-m">${esc(t('autoLabel'))}</button><button id="skip-dec-m">${esc(t('skipDecision'))}</button><button id="journal-m">${esc(t('journal'))}</button><button id="tree-m">${esc(t('familyTree'))}</button>${themeBtn()}${musicBtn()}${sfxBtn()}<button id="leave">${esc(t('leave'))}</button>${langPicker()}</span></span>
  </div>
</header>
<div class="scene-banner" id="scene"></div>
<div class="play">
  <h1 tabindex="-1" class="sr-only">${esc(t('age'))}</h1>
  <aside class="col-left">
    <article class="idcard card" id="idcard"></article>
    <section class="card status"><h2 class="serif">${esc(t('statusTitle'))} <small class="mono">0–100</small></h2>
      <div id="stats" class="stats"></div>
      <details class="explain"><summary>${esc(t('statsExplain'))}</summary><p class="small">${esc(t('statsExplainBody'))}</p></details>
      <p class="status-line"><span id="status" class="pill-s"></span> <span class="muted small" id="where"></span> <span class="sr-only" id="who"></span></p>
      <div class="money"><div><span class="muted">${esc(t('cash'))}</span><strong id="cash"></strong></div><div><span class="muted">${esc(t('liquid'))}</span><strong id="liq"></strong></div><div><span class="muted">${esc(t('invested'))}</span><strong id="inv"></strong></div><div><span class="muted">${esc(t('houseEq'))}</span><strong id="heq"></strong></div><div><span class="muted">${esc(t('debt'))}</span><strong id="debt"></strong></div><div><span class="muted">${esc(t('income'))}</span><strong id="inc"></strong></div></div>
    </section>
  </aside>
  <main class="col-mid">
    <section id="panel" class="panel card" hidden></section>
    <section class="card focuscard" id="focuscard" hidden><h2 class="serif">${esc(t('focusTitle'))} <small class="muted">${esc(t('focusNote'))}</small></h2><div class="focus-pills" id="focus-pills" role="radiogroup" aria-label="${esc(t('focusTitle'))}"></div></section>
    <section class="card spendcard" id="spendcard" hidden><button id="spend" class="primary wide spend-entry"></button><p class="muted small" id="spend-hint" hidden></p>
      <div class="fin-btns" id="fin-btns"><button id="invest" class="ghost">${esc(t('investBtn'))}</button><button id="house" class="ghost">${esc(t('houseBtn'))}</button><button id="loan" class="ghost">${esc(t('loanBtn'))}</button><button id="annuity" class="ghost">${esc(t('annuityBtn'))}</button></div></section>
    <section class="card logcard"><h2 class="serif">${esc(t('log'))}</h2><ol id="log" class="log" aria-live="polite"${contentLangAttr()}></ol>${getLang() !== 'zh-TW' ? `<p class="muted small content-note">${esc(t('contentNote'))}</p>` : ''}<button class="ghost small" id="log-more" hidden></button></section>
  </main>
  <aside class="col-right">
    <section class="card"><h2 class="serif">${esc(t('famTitle'))}</h2><dl id="family" class="fam"></dl></section>
    <section class="card"><h2 class="serif">${esc(t('peersTitle'))} <small class="mono">${esc(t('peersNote'))}</small></h2><ul id="peers" class="peers"><li class="muted small">${esc(t('peersLoading'))}</li></ul></section>
    <section class="card"><h2 class="serif">${esc(t('mapTitle'))} <small class="mono">${esc(t('mapNote'))}</small></h2><div id="lifemap" class="lifemap" role="img" aria-label="${esc(t('mapTitle'))}"></div></section>
  </aside>
</div>
<section id="choice" class="choice modal" hidden aria-live="assertive" role="dialog" aria-modal="true"${contentLangAttr()}></section>
<div id="restore-bar" class="restore" hidden><button class="cta small" id="restore">${esc(t('restore'))}</button></div>
<div id="toast" class="toast" role="status" hidden></div>
<div id="toasts" class="toasts" aria-live="polite"${contentLangAttr()}></div>`, '#pause');
  on('#pause', togglePause);
  root.querySelectorAll<HTMLButtonElement>('.spd').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed) as Speed)));
  on('#spd-cycle', () => setSpeed(SPEEDS[(SPEEDS.indexOf(r.speed) + 1) % SPEEDS.length]!));
  const skipDec = () => { closeMenu(); r.skipping = true; r.paused = false; r.last = performance.now(); syncPause(); };
  on('#skip-dec', skipDec); on('#skip-dec-m', skipDec);
  const toggleAuto = () => { pref.set(K_AUTO, autoOn() ? '0' : '1'); (root.querySelector('#auto') as HTMLElement).setAttribute('aria-pressed', String(autoOn())); closeMenu(); };
  on('#auto', toggleAuto); on('#auto-m', toggleAuto);
  on('#more', () => { const m = root.querySelector('#menu') as HTMLElement; m.hidden = !m.hidden; (root.querySelector('#more') as HTMLElement).setAttribute('aria-expanded', String(!m.hidden)); });
  on('#skip', () => { closeMenu(); hideChoice(); while (!r.s.death) r.s = advanceYear(bundle(), r.s, contentEvents); persist(); death(true); });
  on('#journal-m', () => { closeMenu(); journalSheet(); });
  on('#tree-m', () => { closeMenu(); treeSheet(); });
  on('#leave', () => { closeMenu(); persist(); cancelAnimationFrame(r.raf); run = null; intro(); });
  on('#invest', () => investPanel());
  on('#spend', () => spendSheet());
  on('#house', () => housePanel());
  on('#loan', () => loanPanel(false));
  on('#annuity', () => annuityPanel());
  on('#log-more', () => { logAll = !logAll; renderLog(); });
  on('#restore', () => { (root.querySelector('#choice') as HTMLElement).classList.remove('min'); (root.querySelector('#restore-bar') as HTMLElement).hidden = true; });
  renderLife(true);
}
const closeMenu = () => { const m = root.querySelector('#menu') as HTMLElement | null; if (m) m.hidden = true; };
function syncPause(): void { const b = root.querySelector('#pause') as HTMLElement | null; if (b && run) b.textContent = t(run.paused ? 'resume' : 'pause'); }
function togglePause(): void { const r = run!; r.paused = !r.paused; r.skipping = false; r.last = performance.now(); syncPause(); persist(); }
function setSpeed(x: Speed): void {
  const r = run!; r.speed = x; pref.set(K_SPEED, String(x));
  root.querySelectorAll<HTMLElement>('.spd').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === x)));
  const c = root.querySelector('#spd-cycle'); if (c) c.textContent = `${x}×`;
  persist();
}
/** batch 3 #6: milestone toasts (stack of at most 3) with a generated sound cue */
function milestoneToasts(s: LifeState): void {
  const y = s.years.at(-1); const box = root.querySelector('#toasts') as HTMLElement | null; if (!y || !box) return;
  const ms = milestonesIn(y.eventIds); if (!ms.length) return;
  for (const m of ms) {
    const e = [...s.events].reverse().find((x) => x.id === m.id) ?? { id: m.id, age: s.age };
    const el = document.createElement('div'); el.className = `mtoast mt-${m.cue}`;
    el.innerHTML = `<span class="mono small">${esc(t('years', { n: e.age }))}</span> ${esc(evLine(e).replace(/\{\w+\}/g, '').slice(0, 80))}`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild!.remove();
    window.setTimeout(() => el.remove(), 3500);
  }
  playCue(ms.some((m) => m.cue === 'sad') ? 'sad' : ms.some((m) => m.cue === 'big') ? 'big' : 'joy');
}
function toast(msg: string): void {
  const el = root.querySelector('#toast') as HTMLElement | null; if (!el) return;
  el.textContent = msg; el.hidden = false; setTimeout(() => { if (el.isConnected) el.hidden = true; }, 3500);
}
function onKey(e: KeyboardEvent): void {
  if (!run || run.s.death || (e.target as HTMLElement)?.closest?.('input, select, textarea, dialog')) return;
  const box = root.querySelector('#choice') as HTMLElement | null;
  const onButton = !!(e.target as HTMLElement)?.closest?.('button, a');
  if (e.key === 'Escape') {   // batch 3 #8: Esc closes the menu, a panel, a prompt (= "later") or minimises a decision
    const m = root.querySelector('#menu') as HTMLElement | null; if (m && !m.hidden) { e.preventDefault(); closeMenu(); return; }
    const pc = root.querySelector('#panel:not([hidden]) #p-cancel') as HTMLElement | null; if (pc) { e.preventDefault(); pc.click(); return; }
    if (box && !box.hidden) { e.preventDefault(); ((box.querySelector('#nudge-later') ?? box.querySelector('#dec-min')) as HTMLElement | null)?.click(); return; }
  }
  if (e.key === 'Enter' && !onButton && box && !box.hidden) {   // Enter takes the default choice / "later"
    const def = box.querySelector(`.opt[data-opt="${box.dataset.def ?? ''}"]`) ?? box.querySelector('#nudge-later');
    if (def) { e.preventDefault(); (def as HTMLElement).click(); return; }
  }
  if (box && !box.hidden) { const n = Number(e.key); const opts = box.querySelectorAll<HTMLButtonElement>('.opt'); if (n >= 1 && n <= opts.length) { e.preventDefault(); opts[n - 1]!.click(); } return; }
  if (!root.querySelector('#panel') || !(root.querySelector('#panel') as HTMLElement).hidden) return;
  const sp = speedForKey(e.key); if (sp) { e.preventDefault(); setSpeed(sp); return; }
  if (e.key === ' ') { e.preventDefault(); togglePause(); }
}

function loop(): void {
  const r = run!;
  r.raf = requestAnimationFrame((now) => {
    const dt = Math.min((now - r.last) / 1000, 1);
    r.last = now;
    if (!r.paused) {
      r.acc += (dt * (r.skipping ? SKIP_SPEED : r.speed)) / r.yearSec;
      let steps = 0;
      while (r.acc >= 1 && steps < PARAMS.maxYearsPerFrame.value && !r.s.death) {
        if (pendingOffers(bundle(), r.s).length) { r.acc = Math.min(r.acc, 1); /* v0.7.1: keep the elapsed year so the card costs only its own wait */ if (r.skipping) { r.skipping = false; toast(t('toastDecision')); } showChoice(); break; }
        r.s = advanceYear(bundle(), r.s, contentEvents);
        r.acc -= 1; steps++;
        if (!r.skipping) milestoneToasts(r.s);
        if (r.skipping) { const sad = r.s.years.at(-1)!.eventIds.find((id) => TRAGIC_EVENTS.has(id)); if (sad) { r.skipping = false; r.paused = true; syncPause(); toast(t('toastTragic', { what: eventText(sad, {}).replace(/\{\w+\}/g, '').slice(0, 40) })); break; } }
        if (nudgeDue()) { r.acc = Math.min(r.acc, 1); break; }
      }
      if (steps) { renderLife(false); persist(); }
      if (r.s.death) { death(true); return; }
      if (steps && nudgeDue()) { showNudge(); autoDismiss('#nudge-later', '#nudge-title'); }
      if (steps && r.s.econ.cash < 0 && bridgePrompted !== r.s.age) {
        bridgePrompted = r.s.age;
        if (decisionQuote(bundle(), r.s).loan.ok) { loanPanel(true); autoDismiss('#p-cancel', '#bridge-msg'); }
      }
    }
    const yp = root.querySelector('#yprog') as HTMLElement | null; if (yp) yp.style.width = `${Math.min(100, r.acc * 100).toFixed(1)}%`;
    loop();
  });
}

function statusText(s: LifeState): string {
  const y = s.years[s.years.length - 1];
  if (!y || (!y.inLabor && !y.pension && s.age < s.career.studyUntil + 1 && !s.econ.retired)) return y?.studying ? t(y.income > 0 ? 'studyingWork' : 'studying') : t('child');
  if (!y.inLabor) return y.pension > 0 ? t('retiredPension', { amount: money(y.pension) }) : t('retired');
  return t(y.unemployed ? 'unemployed' : 'employed');
}
const skinOf = (s: LifeState) => { const reg = s.family.region; return /africa|ssa/i.test(reg) ? 4 : /south|mena|latam/i.test(reg) ? 2 : /east|se/i.test(reg) ? 1 : 0; };
const portraitOf = (s: LifeState, px = 64) => portraitSvg({ age: s.age, sex: s.born.sex, skin: skinOf(s), outfit: s.career.trackSet ? ['stable', 'private', 'startup', 'informal'].indexOf(s.career.track) : 4 }, px);

function renderLife(full: boolean): void {
  void full; // the log is re-rendered grouped by age each time
  const r = run!; const s = r.s;
  const q = (id: string) => root.querySelector('#' + id) as HTMLElement;
  const cal = s.born.year + s.age;
  q('where').textContent = nameOf(s.cur);
  q('who').textContent = s.name.full;
  q('age').textContent = t('years', { n: s.age });
  { const nm = q('tb-name'); if (nm.textContent !== s.name.full) { nm.textContent = s.name.full; nm.title = s.name.full; } }
  q('cal').textContent = `${t('yearOf', { year: cal })} · ${s.name.full} · ${t('paceShort', { min: r.paceMin })}`;
  q('status').textContent = statusText(s);
  renderFocus(); renderSpendCard(); renderPeers(); renderScene();
  const [l1, l2] = folioLines(s.name.given ? s.name.full.normalize('NFKD') : 'X', s.born.iso, s.born.year, s.born.sex, s.seed);
  q('idcard').innerHTML = `<header class="band small"><span>${esc(t('idTitle'))} · <span class="mono">${s.cur}</span></span><span class="mono">${cal}</span></header>
    <div class="id-body">${portraitOf(s)}<div><p class="serif id-name">${esc(s.name.full)}</p><dl class="kv">
    <dt>${esc(t('f_sex'))}</dt><dd>${esc(t(s.born.sex === 'M' ? 'male' : 'female'))}</dd>
    <dt>${esc(t('f_born'))}</dt><dd>${esc(nameOf(s.born.iso))} · ${s.born.year}</dd>
    <dt>${esc(t('f_lives'))}</dt><dd>${esc(nameOf(s.cur))} · ${esc(t(s.career.city || s.born.urban ? 'urban' : 'rural'))}</dd>
    <dt>${esc(t('f_quintile'))}</dt><dd class="dots">${'●'.repeat(s.born.quintile)}${'○'.repeat(5 - s.born.quintile)}</dd>
    <dt>${esc(t('f_edu'))}</dt><dd>${esc(t(('edu_' + s.career.plan) as 'edu_none'))}</dd></dl></div></div>
    <p class="folio mono" aria-hidden="true">${esc(l1)}<br>${esc(l2)}</p>`;
  const COL: Record<string, string> = { health: 'var(--good)', happy: 'var(--gold)', smart: 'var(--stamp)', social: 'var(--bad)' };
  q('stats').innerHTML = (['health', 'happy', 'smart', 'social'] as const).map((k) =>
    `<div class="stat"><span>${esc(t(k))}</span><span class="bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.stats[k]}" aria-label="${esc(t(k))}"><i style="width:${s.stats[k]}%;background:${COL[k]}"></i></span><b class="mono">${s.stats[k]}</b></div>`).join('');
  const last = s.years[s.years.length - 1];
  const inv = investedValue(s.portfolio);
  const heq = s.house ? s.house.value - s.house.balance : 0;
  const debt = s.loans.filter((l) => l.status === 'active').reduce((a, l) => a + l.balance, 0) + s.credit.unsecuredDebt;
  const nwNow = s.econ.cash + inv + heq - debt;
  const estBadge = last && last.est.length && Math.round(nwNow) !== 0 ? ` <span class="badge" title="${esc(last.est.join(', '))}">${esc(t('est'))}</span>` : '';
  q('cash').innerHTML = esc(money(nwNow)) + estBadge;
  q('heq').textContent = money(heq);
  q('debt').textContent = money(debt);
  q('liq').textContent = money(s.econ.cash);
  q('inv').textContent = money(inv);
  q('inc').textContent = money(last?.income ?? 0);
  renderFamily(); renderMap(); renderLog();
}

const BIG = new Set(['first_paycheck', 'graduated', 'retire', 'promotion', 'ch_marry_marry', 'ch_child_have', 'wedding', 'windfall']);
const kindOf = (id: string) => (id.startsWith('ch_') ? 'decision' : TRAGIC_EVENTS.has(id) || /illness|loss|default|foreclos|margin/.test(id) ? 'bad' : BIG.has(id) ? 'big' : id.startsWith('fl_') ? 'note' : 'good');
function evLine(e: { id: string; vars?: Record<string, unknown> }): string {
  const vars = Object.fromEntries(Object.entries(e.vars ?? {}).map(([a, v]) => [a, e.id === 'fc_switch' && (a === 'from' || a === 'to') ? String(v).split('+').map((c) => (c === '-' ? t('focusClear') : t(('focus_' + c) as 'focus_none'))).join('、') : typeof v === 'number' && /amount|cost|loss|price|pay|pension/.test(a) ? money(v) : a === 'edu' ? t(('edu_' + v) as 'edu_none') : v]));
  return eventText(e.id, vars as Record<string, string | number>);
}
function logYearsHtml(byAge: Map<number, LifeState['events']>, ages: number[], stars: boolean): string {
  return ages.map((age) => `<li class="yr"><span class="la mono">${esc(t('years', { n: age }))}</span><ul>${byAge.get(age)!.map((e) => {
    const k = `${e.age}:${e.id}`;
    return `<li data-k="${esc(k)}" class="ev ev-${kindOf(e.id)}${starred.has(k) ? ' starred' : ''}">${stars ? `<button class="star" aria-label="${esc(t('star'))}" aria-pressed="${starred.has(k)}">${starred.has(k) ? '★' : '☆'}</button>` : `<span class="star" aria-hidden="true">${starred.has(k) ? '★' : '·'}</span>`}<span>${esc(evLine(e))}</span></li>`;
  }).join('')}</ul></li>`).join('');
}
let sceneKey = '';
function renderScene(): void {
  const s = run!.s; const box = root.querySelector('#scene') as HTMLElement | null; if (!box) return;
  const cal = s.born.year + s.age; const urban = s.career.city || s.born.urban;
  const sp = sceneSpec(cal, s.age, urban, s.seed);
  const label = `${t(('era_' + sp.era) as 'era_now')} · ${nameOf(s.cur)} · ${t(urban ? 'urban' : 'rural')}`;
  const key = `${sp.era}|${sp.phase}|${urban}|${s.cur}|${locale()}`;
  if (key !== sceneKey) { sceneKey = key; box.innerHTML = `${sceneSvg(sp, esc(label))}<span class="scene-label mono">${esc(label)}</span><span class="scene-year mono" id="scene-year"></span>`; box.dataset.era = sp.era; box.dataset.phase = sp.phase; }
  (box.querySelector('#scene-year') as HTMLElement).textContent = String(cal);
}
function renderLog(): void {
  const s = run!.s; const log = root.querySelector('#log') as HTMLElement;
  const byAge = new Map<number, typeof s.events>();
  for (const e of s.events) { const a = byAge.get(e.age) ?? []; a.push(e); byAge.set(e.age, a); }
  const ages = [...byAge.keys()].sort((a, b) => b - a);
  const LIMIT = 8; const shown = logAll ? ages : ages.slice(0, LIMIT);
  log.innerHTML = logYearsHtml(byAge, shown, true);
  log.querySelectorAll<HTMLButtonElement>('.star').forEach((b) => b.addEventListener('click', () => { const k = (b.parentElement as HTMLElement).dataset.k!; if (starred.has(k)) starred.delete(k); else starred.add(k); renderLog(); }));
  const more = root.querySelector('#log-more') as HTMLElement;
  const lm = logMore(ages.length, LIMIT, logAll); more.hidden = lm.hidden; more.textContent = lm.expanded ? t('logLess') : t('logEarlier', { n: lm.earlier });
}
function stageOf(s: LifeState): Stage {
  const k = s.career; const y = s.years.at(-1);
  const studying = s.age >= k.entry && s.age < k.studyUntil && k.plan !== 'none';
  return focusStage({ age: s.age, studying, uni: studying && (k.plan === 'tertiary' || k.plan === 'graduate'), inLabor: !s.econ.retired && s.age >= Math.max(15, k.studyUntil), unemployed: !!y?.unemployed, retired: s.econ.retired });
}
let autoFocusStage = '';
function renderFocus(): void {
  const s = run!.s; const card = root.querySelector('#focuscard') as HTMLElement;
  const st = s.death ? 'none' : stageOf(s); const chips = chipsFor(st);
  card.hidden = !chips.length; if (!chips.length) return;
  const intended = activeAlloc(s.actions, s.age); const eff = mapToStage(intended, st);
  // auto-choice: pick a focus for a new stage when nothing chosen applies here
  if (autoOn() && !Object.keys(eff).length && autoFocusStage !== `${s.age}:${st}`) {
    autoFocusStage = `${s.age}:${st}`;
    decide({ t: 'focus', age: s.age, w: autoAlloc(st, s.stats, s.seed, s.age) }); return;
  }
  const w = weights(eff);
  const ar = (v: number) => (v > 0 ? '↑' : '↓');
  const hint = (c: string) => { const f = focusEffects({ [c]: 1 });
    return [...(Object.entries(f.fx) as [string, number][]).filter(([, v]) => v).map(([k, v]) => t(k as 'health') + ar(v)),
      ...(f.incomeMult > 1 ? [t('incomeShort') + '↑'] : []), ...(f.promoMult !== 1 ? [t('focusPromo') + ar(f.promoMult - 1)] : []), ...(f.costShare > 0 ? [t('focusCost') + '↑'] : [])].join(' '); };
  const pill = (c: string) => { const n = Math.round(eff[c] ?? 0); return `<button class="fpill" data-focus="${c}" aria-pressed="${n > 0}" aria-checked="${n > 0}" data-n="${n}"><b>${esc(t(('focus_' + c) as 'focus_none'))} <span class="dots" aria-hidden="true">${'●'.repeat(Math.min(3, n))}${'○'.repeat(Math.max(0, 3 - n))}</span></b><small class="mono">${esc(n > 0 ? t('focusShare', { p: Math.round((w[c] ?? 0) * 100) }) + ' · ' : '')}${esc(hint(c))}</small></button>`; };
  (root.querySelector('#focus-pills') as HTMLElement).innerHTML = chips.map(pill).join('') + `<button class="fpill clear" data-focus="" aria-pressed="${!Object.keys(eff).length}"><b>${esc(t('focusClear'))}</b></button>`;
  root.querySelectorAll<HTMLButtonElement>('.fpill').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.focus!;
    if (!c) { if (Object.keys(eff).length) decide({ t: 'focus', age: s.age, w: {} }); return; }
    const next = { ...eff, [c]: ((Math.round(eff[c] ?? 0)) + 1) % 4 };
    decide({ t: 'focus', age: s.age, w: Object.fromEntries(Object.entries(next).filter(([, v]) => v > 0)) });
  }));
}
// ---------- batch 2 P14 spend & lifestyle sheet (time pauses while open)
/** v0.8.0 entry card under the ID card / focus area: "花錢·投資" from 15 (spend + invest/house/loan/annuity merged) */
function renderSpendCard(): void {
  const s = run!.s; const card = root.querySelector('#spendcard') as HTMLElement | null; if (!card) return;
  card.hidden = !!s.death || s.age < 6; if (card.hidden) return;
  const open = spendOpen(s.age);
  (root.querySelector('#spend') as HTMLElement).textContent = t(open ? 'spendInvBtn' : 'spendBtn');
  (root.querySelector('#fin-btns') as HTMLElement).hidden = !open;
  const hint = root.querySelector('#spend-hint') as HTMLElement;
  const h = !open ? '' : heavyDebt(bundle(), s) ? t('spendHintDebt') : parentOld(s) && itemState(bundle(), s, 'allowance').ok ? t('spendHintOld') : '';
  hint.hidden = !h; hint.textContent = h;
  // auto-choice manages spending habits (recorded so replays match)
  const ls = lifestyleAt(s.actions, s.age);
  if (open && (ls.auto === 'on') !== autoOn()) decide({ t: 'life', age: s.age, key: 'auto', value: autoOn() ? 'on' : 'off' });
}
function spendSheet(tab0: 'spend' | 'fin' | 'habits' = 'spend'): void {
  const r = run!; const wasRunning = !r.paused; r.paused = true; syncPause();
  const dlg = document.createElement('dialog'); dlg.className = 'sheet spend'; dlg.id = 'spend-sheet';
  let tab = tab0; let more = false;
  const chips = (it: Item) => [...(Object.entries(it.fx) as [string, number][]).map(([k, v]) => `<span class="chip ${v > 0 ? 'up' : 'down'}">${esc(t(k as 'health'))}${v > 0 ? '↑' : '↓'}${Math.abs(v)}</span>`),
    ...(it.bond ? [`<span class="chip up">${esc(t('bond'))}↑</span>`] : [])].join('');
  const row = (key: string) => {
    const s = r.s;
    if (key.startsWith('sell:')) { const id = key.slice(5); const st = sellState(bundle(), s, id); const name = t(('it_' + id) as 'it_gym');
      return `<li class="item sell"><div><b>${esc(t('spendSell', { name }))}</b><div class="chips"><span class="chip">${esc(t('spendOwned'))}</span></div></div><div class="buy"><span class="mono">+${esc(money(st.value))}</span><button class="small" data-sell="${id}">${esc(t('spendSellBtn'))}</button></div></li>`; }
    const it = itemById(key)!; const st = itemState(bundle(), s, it.id);
    const tag = `<span class="cat cat-${it.cat}">${esc(t(('cat_' + it.cat) as 'cat_fun'))}</span>`;
    const btn = it.id === 'house' ? `<button class="small primary" data-house>${esc(t('spendHouseGo'))}</button>`
      : st.ok ? `<button class="small primary" data-buy="${it.id}">${esc(t('spendBuy'))}</button>`
      : `<small class="muted">${esc(st.why === 'cash' && it.minCash > 1 ? t('spendNeedCash', { x: it.minCash }) : t(('why_' + st.why) as 'why_age'))}</small>`;
    return `<li class="item${st.ok || it.id === 'house' ? '' : ' off'}"><div><b>${esc(t(('it_' + it.id) as 'it_gym'))}</b> ${tag}${owned(s, it.id) ? ` <small class="muted">· ${esc(t('spendOwned'))}</small>` : ''}<div class="chips">${chips(it)}</div></div>
      <div class="buy"><span class="mono">${st.price > 0 ? esc(money(st.price)) : esc(t('spendFree'))}</span>${btn}</div></li>`;
  };
  const draw = () => {
    const s = r.s; const open = spendOpen(s.age); if (!open) tab = 'spend';
    const ls = lifestyleAt(s.actions, s.age); const auto = autoOn();
    const sorted = situationSort(bundle(), s);
    const houseRow = open && s.age >= (itemById('house')?.from ?? 22) && !s.house ? ['house'] : [];
    const rest = ITEMS.filter((i) => i.id !== 'house' && !sorted.includes(i.id) && s.age <= i.to && s.age >= i.from).map((i) => i.id);
    const shown = sorted.slice(0, 8);
    const seg = (key: string, opts: string[]) => `<div class="ls-row"><span>${esc(t(('ls_' + key) as 'ls_diet'))}</span><div class="seg" role="radiogroup">${opts.map((o) => `<button role="radio" data-ls="${key}" data-v="${o}" aria-checked="${ls[key] === o}">${esc(t(('ls_' + key + '_' + o) as 'ls_diet_normal'))}</button>`).join('')}</div></div>`;
    const habits = auto ? autoHabits(s) : [];
    const tabs = open ? `<div class="tabs seg" role="tablist">${(['spend', 'fin', 'habits'] as const).map((k) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${esc(t(k === 'spend' ? 'tabSpend' : k === 'fin' ? 'tabFinance' : 'tabHabits'))}</button>`).join('')}</div>` : '';
    const hint = heavyDebt(bundle(), s) ? t('spendHintDebt') : parentOld(s) && sorted[0] === 'allowance' ? t('spendHintOld') : '';
    const body = tab === 'spend' ? `${hint ? `<p class="spend-hint small">${esc(hint)}</p>` : ''}<h3>${esc(t('spendNow'))}</h3><ul class="items" id="spend-list">${[...shown, ...houseRow].map(row).join('')}</ul>
        <details${more ? ' open' : ''} id="spend-more"><summary>${esc(t('spendMore', { n: sorted.length - shown.length + rest.length }))}</summary><ul class="items">${[...sorted.slice(8), ...rest].map(row).join('')}</ul></details>`
      : tab === 'fin' ? `<div class="fin-btns sheet-fin"><button class="ghost" data-fin="invest">${esc(t('investBtn'))}</button><button class="ghost" data-fin="house">${esc(t('houseBtn'))}</button><button class="ghost" data-fin="loan">${esc(t('loanBtn'))}</button><button class="ghost" data-fin="annuity">${esc(t('annuityBtn'))}</button></div>`
      : `<div class="lifestyle">${LIFESTYLE.map((l) => seg(l.key, l.opts)).join('')}
        <p class="small">${esc(t('lsRoutines'))}</p>${auto ? `<p class="muted small" id="auto-habits">${esc(t('spendAutoOn'))}</p>` : ''}
        <div class="routines">${ROUTINES.map((id) => `<label><input type="checkbox" data-rt="${id}" ${(auto ? habits.includes(id) : ls['rt:' + id] === 'on') ? 'checked' : ''}${auto ? ' disabled' : ''}> ${esc(t(('it_' + id) as 'it_gym'))}</label>`).join('')}</div>
        <p class="muted small">${esc(t('lsNote'))}</p></div>`;
    dlg.innerHTML = `<header class="sheet-head"><h2 class="serif">${esc(t(open ? 'spendInvTitle' : 'spendTitle'))}</h2><span class="muted small">${esc(t('spendPaused'))}</span></header>
      <p class="spend-sum"><span>${esc(t('spendSavings'))} <b class="mono">${esc(money(s.econ.cash))}</b></span><span>${esc(t('spendIncome'))} <b class="mono">${esc(money(s.econ.incomeReal))}</b></span>${open ? `<span>${esc(t('bond'))} <b class="mono">${bondOf(s)}</b></span>` : ''}</p>
      ${tabs}${body}
      <div class="row"><button class="primary" id="spend-close">${esc(t('close'))}</button></div>`;
    dlg.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab as typeof tab; draw(); }));
    dlg.querySelector('#spend-more')?.addEventListener('toggle', (e) => { more = (e.currentTarget as HTMLDetailsElement).open; });
    dlg.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => { decide({ t: 'buy', age: r.s.age, id: b.dataset.buy! }); toast(t('spendBought', { name: t(('it_' + b.dataset.buy) as 'it_gym') })); draw(); }));
    dlg.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((b) => b.addEventListener('click', () => { decide({ t: 'sell', age: r.s.age, id: b.dataset.sell! }); toast(t('spendSold', { name: t(('it_' + b.dataset.sell) as 'it_gym') })); draw(); }));
    dlg.querySelector('[data-house]')?.addEventListener('click', () => { dlg.close(); housePanel(); });
    const fin: Record<string, () => void> = { invest: () => investPanel(), house: () => housePanel(), loan: () => loanPanel(false), annuity: () => annuityPanel() };
    dlg.querySelectorAll<HTMLButtonElement>('[data-fin]').forEach((b) => b.addEventListener('click', () => { dlg.close(); fin[b.dataset.fin!]!(); }));
    dlg.querySelectorAll<HTMLButtonElement>('[data-ls]').forEach((b) => b.addEventListener('click', () => { decide({ t: 'life', age: r.s.age, key: b.dataset.ls!, value: b.dataset.v! }); draw(); }));
    dlg.querySelectorAll<HTMLInputElement>('[data-rt]').forEach((c) => c.addEventListener('change', () => { decide({ t: 'life', age: r.s.age, key: 'rt:' + c.dataset.rt!, value: c.checked ? 'on' : 'off' }); }));
    dlg.querySelector('#spend-close')!.addEventListener('click', () => dlg.close());
  };
  draw();
  dlg.addEventListener('close', () => { dlg.remove(); if (wasRunning && run) { run.paused = false; syncPause(); } });
  root.appendChild(dlg); dlg.showModal();
}
// ---------- batch 2 P12 same-second companions (computed once per life, read live by calendar year)
let peers: LifeState[] = [];
async function loadPeers(s: LifeState): Promise<void> {
  const cfgs = sameSecondConfigs(s);
  for (const c of cfgs) { const b = drawBirth(index, c); if (!('infeasible' in b)) await preloadDemography(b.iso); }
  if (run?.s.seed !== s.seed) return;
  peers = sameSecond(bundle(), s, cfgs);
  renderPeers(); renderPeers('#dp-peers');
}
function renderPeers(sel = '#peers'): void {
  const ul = root.querySelector(sel) as HTMLElement | null; if (!ul || !run || !peers.length) return;
  const cal = run.s.born.year + run.s.age;
  ul.innerHTML = peers.map((p) => { const st = statusAt(p, cal);
    return `<li class="${st.alive ? '' : 'gone'}"><span>${esc(st.name)} <small class="muted">${esc(nameOf(st.iso))}</small></span><span class="mono small">${st.alive ? `${esc(t('years', { n: st.age }))} · ${esc(t(('stage_' + st.stage) as 'stage_work'))}` : `† ${esc(t('years', { n: st.age }))}`}</span></li>`; }).join('');
}
const FX_NAME: Record<string, string> = { h: 'health', ha: 'happy', sm: 'smart', so: 'social' };
function minorChips(id: string, opt: string): string {
  const fx = minorById(id)?.opts.find((o) => o.id === opt)?.fx; if (!fx) return '';
  return Object.entries(fx).map(([k, v]) => (k === '$' ? `${t('cash')}${v > 0 ? '↑' : '↓'}` : `${t(FX_NAME[k] as 'health')}${v > 0 ? '↑' : '↓'}`)).join(' ');
}
// ---------- batch 2 X1 language picker (one translation table; re-renders the current screen)
function langPicker(): string {
  return `<label class="lang small"><span class="sr-only">${esc(t('langLabel'))}</span><select class="lang-sel" aria-label="${esc(t('langLabel'))}">${LANGS.map((l) => `<option value="${l}" ${l === getLang() ? 'selected' : ''}>${esc(LANG_NAMES[l])}</option>`).join('')}</select></label>`;
}
/** a sheet that pauses time while open and restores the previous state on close */
function pausedSheet(id: string, html: string, wire: (dlg: HTMLDialogElement) => void): void {
  const r = run!; const wasRunning = !r.paused; r.paused = true; syncPause();
  const dlg = document.createElement('dialog'); dlg.className = 'sheet'; dlg.id = id;
  dlg.innerHTML = html + `<div class="row"><button class="primary" data-close>${esc(t('close'))}</button></div>`;
  dlg.querySelector('[data-close]')!.addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { dlg.remove(); if (wasRunning && run) { run.paused = false; run.last = performance.now(); syncPause(); } });
  root.appendChild(dlg); wire(dlg); dlg.showModal();
}
function journalSheet(): void {
  const s = run!.s; const key = journalKey(APP.storagePrefix, s.id);
  let j = parseJournal(pref.get(key));
  const list = () => { const es = entries(j); const st = s.events.filter((e) => starred.has(`${e.age}:${e.id}`));
    return es.length || st.length ? `<ol class="mem">${[...es.map((e) => ({ age: e.age, html: `✎ ${esc(e.text)}` })), ...st.map((e) => ({ age: e.age, html: `★ ${esc(evLine(e))}` }))].sort((a, b) => a.age - b.age).map((x) => `<li><span class="mono la">${esc(t('years', { n: x.age }))}</span> ${x.html}</li>`).join('')}</ol>` : `<p class="muted">${esc(t('journalEmpty'))}</p>`; };
  pausedSheet('journal', `<h2 class="serif">${esc(t('journalTitle'))}</h2><p class="muted small">${esc(t('journalNote'))}</p>
    <label class="block"><textarea id="j-text" rows="3" maxlength="2000" placeholder="${esc(t('journalPlaceholder', { age: s.age }))}">${esc(j[String(s.age)] ?? '')}</textarea></label>
    <div class="row"><button class="ghost" id="j-save">${esc(t('journalSave'))}</button></div><div id="j-list">${list()}</div>`, (dlg) => {
    dlg.querySelector('#j-save')!.addEventListener('click', () => {
      j = setEntry(j, s.age, (dlg.querySelector('#j-text') as HTMLTextAreaElement).value); pref.set(key, JSON.stringify(j));
      (dlg.querySelector('#j-list') as HTMLElement).innerHTML = list();
    });
  });
}
function treeSheet(): void {
  const s = run!.s; const f = s.family; const cal = s.born.year + s.age;
  const node = (rel: string, name: string, born: number, cls = '') => `<li class="tn ${cls}"><small class="muted">${esc(rel)}</small><b>${esc(name)}</b><span class="mono small">${born}</span></li>`;
  const kids = bornBy(f.children, cal);
  pausedSheet('tree', `<h2 class="serif">${esc(t('familyTree'))}</h2><div class="tree">
    <p class="tg mono">${esc(t('treeParents'))}</p><ul class="tr">${node(t('rel_father'), f.father.name, f.father.born)}${node(t('rel_mother'), f.mother.name, f.mother.born)}</ul>
    <p class="tg mono">${esc(t('treeYourGen'))}</p><ul class="tr">${[...bornBy(f.siblings, cal).filter((x) => x.born < s.born.year).map((x) => node(t('rel_sibling'), x.name, x.born)), node(t('treeYou'), s.name.full, s.born.year, 'me'), ...(f.spouse ? [node(t('rel_spouse'), f.spouse.name, f.spouse.born)] : []), ...bornBy(f.siblings, cal).filter((x) => x.born >= s.born.year).map((x) => node(t('rel_sibling'), x.name, x.born))].join('')}</ul>
    <p class="tg mono">${esc(t('treeChildren'))}</p>${kids.length ? `<ul class="tr">${kids.map((c) => node(t('rel_child'), c.name, c.born)).join('')}</ul>` : `<p class="muted small">${esc(t('treeNone'))}</p>`}
  </div>`, () => undefined);
}
const K_SFX = `${APP.storagePrefix}.sfx.v1`;
setSfx(pref.get(K_SFX) !== '0');
function sfxBtn(): string { return `<button class="pill sfx-t" aria-pressed="${sfxOn()}">🔔 ${esc(t(sfxOn() ? 'sfxOn' : 'sfxOff'))}</button>`; }
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.sfx-t'); if (!b) return;
  setSfx(!sfxOn()); pref.set(K_SFX, sfxOn() ? '1' : '0'); if (sfxOn()) playCue('joy');
  document.querySelectorAll('.sfx-t').forEach((x) => { x.setAttribute('aria-pressed', String(sfxOn())); x.textContent = `🔔 ${t(sfxOn() ? 'sfxOn' : 'sfxOff')}`; });
});
function themeBtn(): string { return `<button class="pill theme-t" data-theme-v="${theme()}" aria-label="${esc(t('themeLabel'))}">◐ ${esc(t(('theme_' + theme()) as 'theme_auto'))}</button>`; }
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.theme-t'); if (!b) return;
  pref.set(K_THEME, nextTheme(theme())); applyTheme();
  document.querySelectorAll('.theme-t').forEach((x) => { (x as HTMLElement).dataset.themeV = theme(); x.textContent = `◐ ${t(('theme_' + theme()) as 'theme_auto')}`; });
});
function musicBtn(): string { return `<button class="pill music-t" aria-pressed="${musicOn()}">♪ ${esc(t(musicOn() ? 'musicOn' : 'musicOff'))}</button>`; }
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.music-t'); if (!b) return;
  if (musicOn()) stopMusic(); else startMusic(run ? run.s.born.year : 1);
  document.querySelectorAll('.music-t').forEach((x) => { x.setAttribute('aria-pressed', String(musicOn())); x.textContent = `♪ ${t(musicOn() ? 'musicOn' : 'musicOff')}`; });
});
document.addEventListener('change', (e) => {
  const el = e.target as HTMLElement;
  if (!el.classList.contains('lang-sel')) return;
  setLang((el as HTMLSelectElement).value as Lang);
  if (run && !run.s.death) { lifeView(); renderLife(true); } else intro();
});
function renderFamily(): void {
  const s = run!.s; const f = s.family; const cal = s.born.year + s.age;
  const row = (rel: string, name: string, born: number, dead = false) => `<div><dt>${esc(rel)}</dt><dd>${esc(name)} <span class="mono small">${dead ? `† ${esc(t('deceased'))}` : esc(t('years', { n: cal - born }))}</span></dd></div>`;
  const parentsDead = !f.parentsAlive;
  (root.querySelector('#family') as HTMLElement).innerHTML = [row(t('rel_mother'), f.mother.name, f.mother.born, parentsDead), row(t('rel_father'), f.father.name, f.father.born, parentsDead),
    ...bornBy(f.siblings, cal).map((x) => row(t('rel_sibling'), x.name, x.born)), ...(f.spouse ? [row(t('rel_spouse'), f.spouse.name, f.spouse.born)] : []), ...bornBy(f.children, cal).map((x) => row(t('rel_child'), x.name, x.born))].join('');
}
function lifeMapHtml(s: LifeState, e0: number): string {
  const n = Math.max(Math.ceil(e0) + 1, s.years.length + 1, 60);
  const keyLine = (age: number) => { const e = s.events.find((x) => x.age === age); return e ? eventText(e.id, {}).replace(/\{\w+\}/g, '…') : ''; };
  return Array.from({ length: Math.min(n, 120) }, (_, i) => {
    const y = s.years[i];
    const cls = `cell${y ? ' on' : ''}${i === Math.round(e0) ? ' e0' : ''}`;
    return `<span class="${cls}" ${y ? `style="opacity:${(0.25 + 0.75 * y.stats.happy / 100).toFixed(2)}" title="${esc(t('years', { n: i }))} ${esc(keyLine(i))}"` : ''}></span>`;
  }).join('');
}
function renderMap(): void {
  const s = run!.s; (root.querySelector('#lifemap') as HTMLElement).innerHTML = lifeMapHtml(s, lifeExpectancy(tableFor(bundle(), s)));
}

// ---------- decision modal (P4, P16)
function showChoice(): void {
  const r = run!; const box = root.querySelector('#choice') as HTMLElement | null;
  if (!box) return;
  const offers = pendingOffers(bundle(), r.s);
  if (!offers.length) { hideChoice(); return; }
  if (box.hidden) { choiceResume = !r.paused; r.paused = true; syncPause(); }
  const o: ChoiceOffer = offers[0]!;
  const k = (p: string) => (p + o.id) as 'ct_hs';
  const cal = r.s.born.year + r.s.age;
  const fact = factFor(o.id, bundle().country(r.s.cur), nameOf(r.s.cur), cal, bundle().demography(r.s.born.iso), bundle().wpp);
  const label = ['vaccine', 'school', 'parents'].includes(o.id) ? 'dec_family' : ['treat', 'move'].includes(o.id) || o.id.startsWith('d_') ? 'dec_small' : 'dec_major';
  const pre = defaultPick(r.s.seed, r.s.age, o);
  box.dataset.def = pre;
  const body = tMaybe('cb_' + o.id);
  const auto = autoOn();
  box.classList.remove('min');
  box.innerHTML = `<header class="dec-head"><span class="kicker">${esc(t(label))}</span><span class="mono small">${esc(t('years', { n: r.s.age }))} · ${cal}</span><button class="ghost small" id="dec-min">${esc(t('minimise'))}</button></header>
    <h2 tabindex="-1" id="choice-title" class="serif">${esc(t(k('ct_')))}</h2>${body ? `<p>${esc(body)}</p>` : ''}
    ${fact ? `<aside class="fact"><p>${esc(fact.text)}${fact.est ? ` <span class="badge">${esc(t('est'))}</span>` : ''}</p><p class="mono cite">${esc(t('factSrc'))}：${esc(fact.cite)}</p></aside>` : ''}
    <div class="opts">${o.opts.map((op, i) => `<button class="opt${auto && op === pre ? ' pre' : ''}" data-opt="${op}"><span class="mono num">${i + 1}</span><span><b>${esc(t(('o_' + o.id + '_' + op) as 'o_hs_work'))}</b><small>${esc(tMaybe('c_' + o.id + '_' + op) || minorChips(o.id, op))}</small></span></button>`).join('')}</div>
    ${auto ? `<div class="autobar" aria-hidden="true"><i id="auto-i"></i></div><div class="row"><button class="ghost small" id="auto-stop">${esc(t('autoStop'))}</button></div>` : `<div class="row"><button class="ghost small" id="auto-now">${esc(t('autoFromNow'))}</button></div>`}`;
  box.hidden = false;
  (box.querySelector('h2') as HTMLElement).focus();
  const pick = (opt: string) => { clearTimeout(autoTimer); decide({ t: 'choice', age: r.s.age, id: o.id, opt }); showChoice(); };
  box.querySelectorAll<HTMLButtonElement>('.opt').forEach((b) => b.addEventListener('click', () => pick(b.dataset.opt!)));
  on('#dec-min', () => { box.classList.add('min'); (root.querySelector('#restore-bar') as HTMLElement).hidden = false; });
  clearTimeout(autoTimer);
  if (auto) {
    const sec = autoCountdownSec(t(k('ct_')).length + body.length + (fact?.text.length ?? 0), r.speed);
    const bar = box.querySelector('#auto-i') as HTMLElement;
    bar.style.transitionDuration = `${sec}s`; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '100%'; }));
    autoTimer = window.setTimeout(() => pick(pre), sec * 1000);
    const stop = () => { clearTimeout(autoTimer); box.querySelector('.autobar')?.remove(); box.querySelector('.opt.pre')?.classList.remove('pre'); };
    box.addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('button')) stop(); }, { once: true });
    on('#auto-stop', stop);
  } else on('#auto-now', () => { pref.set(K_AUTO, '1'); (root.querySelector('#auto') as HTMLElement).setAttribute('aria-pressed', 'true'); showChoice(); });
}
function hideChoice(): void {
  const r = run; const box = root.querySelector('#choice') as HTMLElement | null;
  clearTimeout(autoTimer);
  if (!r || !box || box.hidden) return;
  box.hidden = true; box.innerHTML = ''; box.classList.remove('min');
  const rb = root.querySelector('#restore-bar') as HTMLElement | null; if (rb) rb.hidden = true;
  if (choiceResume) { r.paused = false; r.last = performance.now(); }
  choiceResume = false;
  syncPause();
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
      ${a === 'eqHome' && proxy && av.ok ? `<small class="why">${esc(t('proxyWorld'))}</small>` : ''}
      ${a === 'btc' && av.ok && calYear > LAST_DATA_YEAR && BTC_FUTURE_DAMPENED ? `<small class="why" id="btc-future">${esc(t('btcFuture'))}</small>` : ''}</div>`;
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
  const s = run!.s;
  if (s.house) {
    const h = s.house;
    openPanel(`<h2 tabindex="-1">${esc(t('houseTitle'))}</h2>
      <dl class="facts"><dt>${esc(t('houseValue'))}</dt><dd id="h-value">${esc(money(h.value))}${h.est ? ` <span class="badge">${esc(t('est'))}</span>` : ''}</dd>
      <dt>${esc(t('mortgageLeft'))}</dt><dd>${esc(money(h.balance))}${esc(t('termLeft', { n: h.termLeft }))}</dd>
      <dt>${esc(t('sellNet'))}</dt><dd>${esc(money(h.value * (1 - PARAMS.sellCost.value) - h.balance))}</dd></dl>
      <p class="muted">${esc(t('sellHelp'))}</p>`, () => { decide({ t: 'sellHouse', age: s.age }); });
    (root.querySelector('#p-ok') as HTMLElement).textContent = t('sellHouse');
    return;
  }
  let term: number = houseTerm;
  const render = () => {
    const q2 = decisionQuote(bundle(), s, term).house;
    return `<label class="inline">${esc(t('termLabel'))} <select id="h-term">${MORTGAGE_TERMS.map((n) => `<option value="${n}" ${n === term ? 'selected' : ''}>${esc(t('termYears', { n }))}</option>`).join('')}</select></label>
    <dl class="facts"><dt>${esc(t('housePrice'))}</dt><dd id="h-price">${esc(money(q2.price))}${q2.est ? ` <span class="badge">${esc(t('est'))}</span>` : ''}</dd>
    <dt>${esc(t('downPay'))}</dt><dd>${esc(money(q2.down))}</dd>
    <dt>${esc(t('mortgage'))}</dt><dd>${esc(money(q2.loan))} · ${esc(t('termYears', { n: q2.term }))} · ${esc(t('floatRate'))} ${pctR(q2.rate)}</dd>
    <dt>${esc(t('yearPay'))}</dt><dd id="h-pmt">${esc(money(q2.pmt))}</dd>
    <dt>${esc(t('needIncome'))}</dt><dd id="h-need-inc">${esc(money(q2.needIncome))} <small class="muted">${esc(t('needIncomeNote'))}</small></dd>
    <dt>${esc(t('yourIncome'))}</dt><dd>${esc(money(s.econ.employed ? s.econ.incomeReal : 0))}</dd>
    <dt>${esc(t('needDown'))}</dt><dd id="h-need-down">${esc(money(q2.needDown))}（${esc(t('cash'))} ${esc(money(s.econ.cash))}）</dd></dl>
    <p class="muted">${esc(t('houseHelp'))}</p>
    ${q2.ok ? '' : `<p class="warn" id="h-why">${esc(whyText(q2.why))}</p>`}`;
  };
  const q0 = decisionQuote(bundle(), s, term).house;
  openPanel(`<h2 tabindex="-1">${esc(t('houseTitle'))}</h2><div id="h-body">${render()}</div>`, () => {
    const qq = decisionQuote(bundle(), s, term).house;
    if (!qq.ok) return false;
    houseTerm = term; decide({ t: 'buyHouse', age: s.age, term }); return true;
  });
  const okBtn = root.querySelector('#p-ok') as HTMLButtonElement;
  okBtn.textContent = t('buyHouse'); okBtn.disabled = !q0.ok;
  const bind = () => root.querySelector('#h-term')?.addEventListener('change', (e) => {
    term = Number((e.target as HTMLSelectElement).value);
    (root.querySelector('#h-body') as HTMLElement).innerHTML = render(); bind();
    okBtn.disabled = !decisionQuote(bundle(), s, term).house.ok;
  });
  bind();
}
let houseTerm = 30;
function loanPanel(bridge: boolean): void {
  const s = run!.s; const q = decisionQuote(bundle(), s).loan;
  const def = bridge ? Math.min(q.max, Math.ceil(q.bridgeNeed)) : Math.floor(q.max / 2);
  openPanel(`<h2 tabindex="-1">${esc(t(bridge ? 'bridgeTitle' : 'loanTitle'))}</h2>
    ${bridge ? `<p class="prompt" id="bridge-msg">${esc(t('bridgeMsg', { amount: money(q.bridgeNeed) }))}</p>` : ''}
    <dl class="facts"><dt>${esc(t('loanMax'))}</dt><dd id="l-max">${esc(money(q.max))}${q.src === 'proxy' ? ` <span class="badge">${esc(t('est'))}</span>` : ''}</dd>
    <dt>${esc(t('floatRate'))}</dt><dd>${pctR(q.rate)} <span class="badge" title="${esc(t('rateTitle'))}">${esc(t('est'))}</span></dd>
    ${q.noteKey && q.noteKey !== 'none' ? `<dt>${esc(t('ruleNote'))}</dt><dd><small id="l-rule">${esc(t(('rn_' + q.noteKey) as 'rn_tw'))}</small></dd>` : ''}</dl>
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

// ---------- P0-3 life choices & finance nudges (pause the clock; answers are recorded actions → replay)

/** v0.7.1: with auto-choice on, prompts the game raises by itself (nudges, bridge-loan offer) close after the same
 *  speed-scaled countdown as a decision card, instead of stopping time until a click. */
function autoDismiss(btnSel: string, textSel: string): void {
  if (!autoOn() || !run) return;
  const len = (root.querySelector(textSel)?.textContent ?? '').length;
  window.setTimeout(() => { (root.querySelector(btnSel) as HTMLElement | null)?.click(); }, autoCountdownSec(len, run.speed) * 1000);
}
function nudgeDue(): string | null {
  const s = run!.s; if (s.death) return null;
  const last = s.age - 1;
  const had = (id: string) => s.events.some((e) => e.age === last && e.id === id);
  if (!nudged.has('invest') && bundle().markets && had('first_paycheck') && !Object.keys(s.portfolio.target).length) return 'invest';
  if (!nudged.has('house') && had('ch_marry_marry') && !s.house) return 'house';
  if (!nudged.has('annuity') && s.age === PARAMS.annuityMinAge.value + 5 && s.econ.cash > 0) return 'annuity';
  return null;
}
function showNudge(): void {
  const r = run!; const key = nudgeDue(); const box = root.querySelector('#choice') as HTMLElement | null;
  if (!key || !box) return;
  nudged.add(key);
  choiceResume = !r.paused; r.paused = true; syncPause();
  box.innerHTML = `<p class="kicker">${esc(t('years', { n: r.s.age }))}</p><h2 tabindex="-1" id="nudge-title">${esc(t(('nudge_' + key) as 'nudge_invest'))}</h2>
    <div class="row"><button class="primary" id="nudge-open">${esc(t('nudgeOpen'))}</button><button id="nudge-later">${esc(t('nudgeLater'))}</button></div>`;
  box.hidden = false; (box.querySelector('h2') as HTMLElement).focus();
  on('#nudge-later', hideChoice);
  on('#nudge-open', () => { const resume = choiceResume; hideChoice(); r.paused = true; if (key === 'invest') investPanel(); else if (key === 'house') housePanel(); else annuityPanel(); void resume; });
}


function persist(): void {
  if (!run) return;
  writeSave({ v: 1, cfg: run.cfg, paceMin: run.paceMin, years: run.s.years.length, speed: run.speed, actions: run.s.actions.filter((a) => 'age' in a) });
}

async function replay(cfg: LifeConfig, years: number, acts: Action[]): Promise<LifeState | null> {
  const b = drawBirth(index, cfg);
  if ('infeasible' in b) return null;
  await preloadDemography(b.iso);
  let s = newLife(bundle(), cfg);
  if ('infeasible' in s) return null;
  const applyAt = (st: LifeState) => { for (const a of acts) if ('age' in a && a.age === st.age) st = applyAction(bundle(), st, a); return st; };
  for (let i = 0; i < years && !s.death; i++) { s = applyAt(s); s = advanceYear(bundle(), s, contentEvents); }
  if (!s.death) s = applyAt(s);
  return s;
}
// X4: resume the life in progress (deterministic replay of the recorded recipe)
async function resume(sv: NonNullable<ReturnType<typeof loadSave>>): Promise<void> {
  const s = await replay(sv.cfg, sv.years, sv.actions ?? []);
  if (!s) { clearSave(); intro(); return; }
  if (s.death) { run = { s, cfg: sv.cfg, paceMin: sv.paceMin, speed: 1, paused: true, acc: 0, yearSec: 1, raf: 0, last: 0, skipping: false }; death(false); return; }
  startLife(s, sv.cfg, sv.paceMin, (SPEEDS as readonly number[]).includes(sv.speed) ? (sv.speed as Speed) : 1);
}
// H11: reopen a past life's death record
async function reopen(l: PastLife): Promise<void> {
  if (!l.cfg) return;
  const s = await replay(l.cfg, l.years ?? 200, l.actions ?? []);
  if (!s || !s.death) return;
  run = { s, cfg: l.cfg, paceMin: l.paceMin ?? 60, speed: 1, paused: true, acc: 0, yearSec: 1, raf: 0, last: 0, skipping: false };
  death(false, true);
}

// ---------- final moments (E1) + death record (E2) + share (E4)
function death(withEnding = false, reopened = false): void {
  const r = run!; const s = r.s; const d = s.death!;
  cancelAnimationFrame(r.raf);
  clearTimeout(autoTimer);
  const me = summarize(s);
  const peers = companions(bundle(), s, PARAMS.companionsN.value, contentEvents);
  const rk = ranks(me, peers);
  if (!reopened) {
    clearSave();
    addPastLife({ id: s.id, seed: s.seed, iso: s.born.iso, name: `${s.name.full}（${nameOf(s.born.iso)}）`, year: s.born.year, age: d.age, netWorth: me.finalNetWorth, at: s.born.year + d.age, cfg: r.cfg, years: s.years.length, actions: s.actions.filter((a) => 'age' in a), paceMin: r.paceMin });
  }
  const estYears = s.years.filter((y) => y.est.length).length;
  const calls = s.events.filter((e) => e.id === 'marginCall').length;
  const mktEst = s.years.filter((y) => y.est.some((k) => k.startsWith('mkt:'))).length;
  const end = ending(s, seriesAt(bundle().country(s.born.iso).series.gdpPcPpp, d.year).v);
  const pctOr = (x: number | null) => (x === null ? esc(t('pctNA')) : pctText(x));
  const adult = d.age >= 18;
  const hap = end.happiest;
  const country = nameOf(s.born.iso);
  const cause = t(('dc_' + end.cause) as 'dc_heart');
  const e0 = lifeExpectancy(tableFor(bundle(), { ...s, age: 0 }));
  const diff = Math.round(d.age - e0);
  const edu = t(('edu_' + s.career.plan) as 'edu_none');
  const track = s.career.trackSet ? t(('track_' + s.career.track) as 'track_private') : '';
  const story = t('deathStory', { name: s.name.full, year: s.born.year, country, age: d.age,
    edu: adult ? t('ds_edu', { edu }) : '', work: adult && track ? t('ds_work', { track }) : '',
    family: s.family.spouse ? (s.family.children.length ? t('ds_family_kids', { spouse: s.family.spouse.name, n: s.family.children.length }) : t('ds_family_spouse', { spouse: s.family.spouse.name })) : '' });
  const longer = 1 - rk.lifespan;
  const countries = [...new Set([s.born.iso, s.cur])].map(nameOf).join('、');
  view(`<div class="death-page">
<div class="dp-top"><button class="ghost" id="home-top">${esc(t('homeBack'))}</button></div>
<h1 tabindex="-1" class="sr-only">${esc(t('deathPage'))}</h1>
<article class="cert death-cert" id="record" aria-label="${esc(t('recTitle'))}">
  <header class="band dark"><span class="serif">${esc(t('deathRecTitle'))}</span><span class="mono">${esc(t('certNo', { no: registryNo(s.born.iso, s.born.year, s.seed, 'D') }))}</span></header>
  <div class="cert-body">
    <p class="mono lbl">${esc(country)} · ${esc(t(s.born.sex === 'M' ? 'male' : 'female'))}</p>
    <h2 class="cert-name serif" id="rec-name">${esc(s.name.full)}</h2>
    <p class="lead" id="died">${esc(country)} · ${esc(t('bornDied', { born: s.born.year, died: d.year }))} · ${esc(t('diedAt', { year: d.year, age: d.age }))}</p>
    <p class="story">${esc(story)}</p>
    <p class="cause-line serif" id="cause">${esc(cause)} <span class="badge" title="${esc(t('causeTitle'))}">${esc(t('est'))}</span></p>
    <p class="ctx">${esc(t('ctxLonger', { p: pctText(longer) }))} ${esc(t('ctxVsE0', { e0: e0.toFixed(1), diff: diff > 0 ? t('ctxMore', { n: diff }) : diff < 0 ? t('ctxLess', { n: -diff }) : t('ctxSame') }))}</p>
    <dl class="grid">
      <div><dt>${esc(t('g_span'))}</dt><dd>${s.born.year}–${d.year}</dd></div>
      <div><dt>${esc(t('g_place'))}</dt><dd>${esc(nameOf(s.cur))}</dd></div>
      ${adult ? `<div><dt>${esc(t('g_edu'))}</dt><dd>${esc(edu)}</dd></div><div><dt>${esc(t('g_job'))}</dt><dd>${esc(track || t('none'))}</dd></div>` : ''}
      <div><dt>${esc(t('g_partner'))}</dt><dd>${esc(s.family.spouse?.name ?? t('none'))}</dd></div>
      <div><dt>${esc(t('g_kids'))}</dt><dd>${esc(s.family.children.length ? s.family.children.map((c) => c.name).join('、') : t('none'))}</dd></div>
      ${hap ? `<div><dt>${esc(t('g_happiest'))}</dt><dd id="happiest">${esc(t('happiestLine', { age: hap.age, year: hap.year }))}${hap.eventId ? `<br><small>${esc(eventText(hap.eventId, {}).replace(/\{\w+\}/g, ''))}</small>` : ''}</dd></div>` : ''}
      <div><dt>${esc(t('g_countries'))}</dt><dd>${esc(countries)}</dd></div>
      <div><dt>${esc(t('g_estate'))}</dt><dd>${esc(money(me.finalNetWorth))}</dd></div>
    </dl>
    <blockquote id="last-words"><span class="muted small">${esc(t('lastWords'))}</span><br>${esc(t(end.lastWords as 'lw_generic1', end.vars))}</blockquote>
  </div>
</article>
<div class="dp-actions"><button class="ghost" id="share-open">${esc(t('shareOpen'))}</button><button class="ghost" id="replay-end">${esc(t('endReplay'))}</button></div>
${epilogueHtml(s)}
<section class="card after">
<h2 class="serif">${esc(t('deathTitle'))}</h2>
<dl class="facts">
  <dt>${esc(t('lifetimeIncome'))}</dt><dd>${esc(money(me.lifetimeIncome))}</dd>
  <dt>${esc(t('taxPaid'))}</dt><dd id="tax">${esc(money(s.years.reduce((a, y) => a + y.tax, 0)))}</dd>
  <dt>${esc(t('finalNetWorth'))}</dt><dd id="nw">${esc(money(me.finalNetWorth))}</dd>
  <dt>${esc(t('pctLifespan'))}</dt><dd>${pctText(rk.lifespan)}</dd>
  <dt>${esc(t('pctIncome'))}</dt><dd>${pctOr(rk.lifetimeIncome)}</dd>
  <dt>${esc(t('pctNetWorth'))}</dt><dd id="pct-nw">${pctOr(rk.finalNetWorth)}</dd>
  <dt>${esc(t('lifePension'))}</dt><dd id="pen">${esc(money(s.years.reduce((a, y) => a + y.pension, 0)))}</dd>
  ${s.credit.defaults ? `<dt>${esc(t('defaults'))}</dt><dd id="defaults">${s.credit.defaults}</dd>` : ''}
  ${s.actions.some((a) => a.t === 'alloc') ? `<dt>${esc(t('marginCalls'))}</dt><dd id="calls">${calls}</dd><dt>${esc(t('mktEstYears'))}</dt><dd>${mktEst}</dd>` : ''}
</dl>
<p class="muted small">${esc(t('beatsNote'))}</p>
<p class="muted">${esc(t('peersLine', { n: peers.length }))}${estYears ? esc(t('peersEst', { n: estYears })) : ''}</p>
<h3 class="serif">${esc(t('mapTitle'))} <small class="mono">${esc(t('mapNote'))}</small></h3><div class="lifemap">${lifeMapHtml(s, e0)}</div>
${lineChart(s.years.map((y) => y.netWorth), { label: t('chartNetWorth'), color: '#2F5D8A' })}
${s.years.some((y) => y.debt > 0) ? lineChart(s.years.map((y) => y.debt), { label: t('chartDebt'), color: '#8E3B5A' }) : ''}
${lineChart(s.years.map((y) => y.income), { label: t('chartIncome'), color: '#B8902E' })}
<p class="muted">${esc(t('money'))}</p>
<p class="muted">seed <code id="seed">${esc(s.seed)}</code> <button id="copy" class="link">${esc(t('copySeed'))}</button></p>
</section>
<div class="row end-row"><button class="cta" id="again">${esc(t('again'))} <span aria-hidden="true">→</span></button><button class="ghost" id="home">${esc(t('home'))}</button></div>
<div class="sticky-foot"><button class="ghost" id="share-foot">${esc(t('shareOpen'))}</button><button class="cta" id="again-foot">${esc(t('again'))}</button></div>
</div>`);
  const card: ShareCard = { app: APP.title, title: t('deathRecTitle'), name: s.name.full, span: `${s.born.year}–${d.year} · ${t('years', { n: d.age })}`, country, cause, e0,
    facts: [t('shareFact1', { v: money(me.lifetimeIncome) }), hap ? t('shareFact2', { age: hap.age }) : edu, t('shareFact3', { p: pctText(rk.lifespan) })], map: s.years.map((y) => y.stats.happy),
    text: t('shareTextT', { name: s.name.full, born: s.born.year, died: d.year, country, age: d.age, cause, app: APP.title }) };
  const again = () => { run = null; intro(); };
  on('#again', again); on('#again-foot', again);
  on('#home', () => { run = null; intro(); }); on('#home-top', () => { run = null; intro(); });
  on('#copy', () => { void navigator.clipboard?.writeText(s.seed).then(() => { (root.querySelector('#copy') as HTMLElement).textContent = t('copied'); }); });
  on('#share-open', () => shareSheet(card)); on('#share-foot', () => shareSheet(card));
  const fm = finalMoments(s, country, hap);
  const endingIn: EndingIn = { years: s.years.map((y) => y.calYear), portrait: portraitOf(s, 192), captions: fm.map((m) => m.caption), final: t('cap_final', { age: d.age, cause }), labels: { arm: t('endSkipArm'), done: t('endDone') },
    moments: fm.map((m) => ({ ...m, portrait: portraitOf({ ...s, age: m.age }, 192) })),
    lived: { n: esc(t('livedN', { n: d.age })), label: esc(t('livedLabel')), sub: esc(t('livedSub', { name: s.name.full, born: s.born.year, died: d.year, country })) } };
  if (peers.length && peers[0] && run?.s.seed === s.seed) renderPeers('#dp-peers'); else void loadPeers(s);
  on('#replay-end', () => { playEnding(document.body, endingIn, () => undefined); });
  if (withEnding) playEnding(document.body, endingIn, (skipped) => { if (!skipped) shareSheet(card); });
}
function epilogueHtml(s: LifeState): string {
  const relName = (m: Mourner) => (m.rel === 'friends' ? t('friendsN', { n: m.n ?? 0 }) : `${t(('rel_' + m.rel) as 'rel_child')} ${m.name}`);
  const mo = seeOff(s);
  const v = visited(s, index.countries.map((c) => c.iso));
  const mem = memorable(s, starred, BIG);
  const byAge = new Map<number, LifeState['events']>();
  for (const e of s.events) { const a = byAge.get(e.age) ?? []; a.push(e); byAge.set(e.age, a); }
  const ages = [...byAge.keys()].sort((a, b) => a - b);
  return `<section class="card epilogue" id="epilogue"><h2 class="serif">${esc(t('epiTitle'))}</h2>
  <div class="epi-grid">
    <div id="dp-seeoff"><h3 class="serif">${esc(t('seeOffTitle'))}</h3>${mo.length ? `<ul class="chips-l">${mo.map((m) => `<li>${esc(relName(m))}</li>`).join('')}</ul>` : `<p class="muted">${esc(t('seeOffAlone'))}</p>`}</div>
    <div id="dp-hobbies"><h3 class="serif">${esc(t('hobbiesTitle'))}</h3><ul class="chips-l">${hobbies(s).map((h) => `<li>${esc(t(('hob_' + h) as 'hob_music'))}</li>`).join('')}</ul></div>
    <div id="dp-visited"><h3 class="serif">${esc(t('visitedTitle'))}</h3><p>${esc(t('livedIn', { list: v.lived.map(nameOf).join('、') }))}</p><p>${esc(v.trips.length ? t('tripsTo', { list: v.trips.map(nameOf).join('、') }) : t('noTrips'))}</p></div>
    <div><h3 class="serif">${esc(t('sameSecTitle'))}</h3><ul id="dp-peers" class="peers"><li class="muted small">${esc(t('peersLoading'))}</li></ul></div>
  </div>
  <h3 class="serif">${esc(t('memTitle'))}</h3>${mem.length ? `<ol class="mem" id="dp-mem"${contentLangAttr()}>${mem.map((e) => `<li><span class="mono la">${esc(t('years', { n: e.age }))}</span> ${e.starred ? '★ ' : ''}${esc(evLine(e))}</li>`).join('')}</ol>` : `<p class="muted" id="dp-mem">${esc(t('memEmpty'))}</p>`}
  <details class="full-log" id="dp-log"><summary class="serif">${esc(t('fullLogTitle'))} <small class="mono">${ages.length}</small></summary><ol class="log"${contentLangAttr()}>${logYearsHtml(byAge, ages, false)}</ol></details>
</section>`;
}
function finalMoments(s: LifeState, country: string, hap: { age: number } | undefined): { age: number; caption: string }[] {
  const out = [{ age: 0, caption: t('cap_born', { year: s.born.year, country }) }];
  const first = (id: string) => s.events.find((e) => e.id === id);
  for (const [id, key] of [['graduated', 'cap_graduated'], ['first_paycheck', 'cap_first_paycheck'], ['ch_marry_marry', 'cap_wedding'], ['ch_child_have', 'cap_child'], ['promotion', 'cap_promotion'], ['retire', 'cap_retire']] as const) {
    const e = first(id); if (e) out.push({ age: e.age, caption: t(key, { age: e.age }) });
  }
  if (hap) out.push({ age: hap.age, caption: t('cap_happiest', { age: hap.age }) });
  return out.sort((a, b) => a.age - b.age).slice(0, 7);
}
function shareSheet(card: ShareCard): void {
  const dlg = document.createElement('dialog'); dlg.className = 'sheet share'; dlg.id = 'share-sheet';
  const cv = document.createElement('canvas');
  drawShareCard(cv, card);
  const url = cv.toDataURL('image/png');
  dlg.innerHTML = `<div class="share-grid"><img id="share-img" alt="${esc(card.name)}" src="${url}"><div><h2 class="serif">${esc(t('shareTitle'))}</h2><p class="small">${esc(card.text)}</p>
    <div class="col-btns"><button class="cta" id="sh-share">${esc(t('shareImage'))}</button><a class="btn ghost" id="sh-save" download="${esc(card.name)}.png" href="${url}">${esc(t('saveImage'))}</a><button class="ghost" id="sh-copy">${esc(t('copyText'))}</button><button class="ghost" id="sh-close">${esc(t('close'))}</button></div>
    <p class="muted small">${esc(t('longPress'))}</p></div></div>`;
  dlg.addEventListener('close', () => dlg.remove());
  root.appendChild(dlg); dlg.showModal();
  dlg.querySelector('#sh-close')!.addEventListener('click', () => dlg.close());
  dlg.querySelector('#sh-copy')!.addEventListener('click', () => { void navigator.clipboard?.writeText(card.text).then(() => { (dlg.querySelector('#sh-copy') as HTMLElement).textContent = t('copiedText'); }); });
  dlg.querySelector('#sh-share')!.addEventListener('click', () => {
    cv.toBlob((b) => {
      if (!b) return;
      const file = new File([b], `${card.name}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) void nav.share({ files: [file], text: card.text }).catch(() => undefined);
      else (dlg.querySelector('#sh-save') as HTMLElement).click();
    });
  });
}

function on(sel: string, fn: () => void): void {
  root.querySelector(sel)?.addEventListener('click', fn);
}
