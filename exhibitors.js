/* Showsum HQ · Exhibitors (release 8): the Exhibitor Leads app as a section of HQ, in HQ's shell and look.
 * Everything Exhibitor Leads does (shows, lists, checks, Companies House, the diary, searches, CSV, notifications) plus
 * the pipeline's side of each show (Go, the fast lane, your calls). It talks to Exhibitor Leads with your HQ sign-in and
 * to HQ's own script for the pipeline, through hq.js. All of it is held in memory only, never saved on the device. */
(function () {
'use strict';
const C = window.Core;
let api = null;   // from hq.js: call, callEl, elUrl, helloDone, toast, rerender, isHere

/* ---------- State (memory only) ---------- */
const X = {
  shows: [], searches: {}, loaded: false, loading: false, loadedAt: 0, err: '', errKind: '',
  rows: {}, rowsAt: {}, pipe: {}, pipeAll: null, pipeAllAt: 0, pipeAllLoading: null,
  status: null, statusLoading: false, build: null, usage: null, usageHidden: '', offline: '',
  diaries: {}, diaryFail: {}, diaryType: 'all', diaryQ: '', diaryFor: '',
  route: { v: 'home' }, routeKey: '', filter: 'all', nextFilter: '', statusAt: 0, statusErr: '', diaryLoading: {}, q: '', limit: 200, sel: null, pick: null, whyText: '', shared: null,
};
const E = { running: false, stop: false, showId: null, idle: 0, userPaused: false };
const EXPECT_EL = 19;
const STEP_WORDS = { first: 'First email', day2: 'Day 2', last: 'Last touch', season: 'Season planning', done: 'Done' };
const PIPE_FILTERS = [{ id: 'pipe-in', label: 'In pipeline' }, { id: 'pipe-check', label: 'Your call' }, { id: 'pipe-out', label: 'Not in pipeline' }];

/* ---------- Helpers ---------- */
const esc = (s) => C.esc(s == null ? '' : s);
const plural = (n, one, many) => C.plural(n, one, many);
const commas = (n) => Number(n || 0).toLocaleString('en-GB');
const today = () => C.todayIso();
const $ = (sel, root) => (root || document).querySelector(sel);
const showById = (id) => X.shows.find((s) => s.id === id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const enc = (s) => encodeURIComponent(String(s || ''));
function setHtml(id, html) { const el = document.getElementById(id); if (el && el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; } }
function svg(body, extra) { return `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra || ''}>${body}</svg>`; }
const I = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  down: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  pin: svg('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  out: svg('<path d="M7 17 17 7M9 7h8v8"/>'),
  chev: svg('<path d="m9 6 6 6-6 6"/>'),
  search: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  tick: svg('<path d="m5 12 5 5 9-10"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  people: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.6 5.2"/>'),
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="6" width="3.6" height="12" rx="1.2"/><rect x="13.4" y="6" width="3.6" height="12" rx="1.2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.5 6.2v11.6c0 .8.9 1.3 1.6.8l8.6-5.8c.6-.4.6-1.2 0-1.6l-8.6-5.8c-.7-.5-1.6 0-1.6.8z"/></svg>',
};
function lineOf(sector) {
  const s = String(sector || '');
  if (/christmas|xmas|festive|yule|advent|winter\s+(fair|market)/i.test(s)) return 'var(--l-xmas)';
  if (/bab(y|ies)|toddler|nurser|maternity|parent|kids|child/i.test(s)) return 'var(--l-baby)';
  if (/craft|\bart|stitch|yarn|wool|quilt|sew|paper|ceramic|maker/i.test(s)) return 'var(--l-crafts)';
  if (/caravan|camping|motorhome/i.test(s)) return 'var(--l-caravans)';
  return 'var(--l-other)';
}
const hashFor = {
  home: () => '#/exhibitors',
  sector: (name) => '#/exhibitors/s/' + enc(name),
  show: (id) => '#/exhibitors/x/' + enc(id),
  diary: (name) => '#/exhibitors/d/' + enc(name),
};
function go(hash) { if (location.hash === hash) { if (api.isHere()) api.rerender(); } else location.hash = hash; }
const errText = (e) => (e && e.kind === 'signin' ? 'Sign in again to carry on.' : e && e.kind === 'network' ? 'Couldn’t reach Exhibitor Leads. Check you’re online, then Retry.'
  : /unknown action/i.test((e && e.message) || '') ? 'Your Exhibitor Leads script needs its new version first: paste release 19 and deploy a new version.' : (e && e.message) || 'Something went wrong.');
const elErr = errText;
function toast(msg, bad, ms) { if (api.signedIn()) api.toast(msg, bad, ms); }

/* ---------- Talking to Exhibitor Leads and to HQ's script (through hq.js, with your HQ sign-in) ---------- */
/* After sign-out nothing carries on: no new calls, and answers already on their way are dropped (reset() bumps gen). */
let gen = 0;
const goneErr = () => Object.assign(new Error('Signed out.'), { kind: 'gone' });
const isGone = (e) => !!e && e.kind === 'gone';
function mine(p) { const g = gen; return p.then((v) => { if (g !== gen) throw goneErr(); return v; }, (e) => { throw g !== gen ? goneErr() : e; }); }
function el(action, data, ms) {
  if (!api.signedIn()) return Promise.reject(goneErr());
  return mine(api.callEl(action, data || {}, { timeout: ms || 60000 }));
}
function hq(action, data, ms) {
  if (!api.signedIn()) return Promise.reject(goneErr());
  return mine(api.call(action, data || {}, { timeout: ms || 60000 })).catch((e) => {
    if (/unknown action/i.test((e && e.message) || '')) throw Object.assign(new Error('Your HQ script needs release 8 for this: paste HQ’s new Code.gs and deploy a new version.'), { kind: 'server' });
    throw e;
  });
}

async function loadShows(quiet, fresh) {
  // fresh: after a change, a read already on its way may predate it, so wait for that one and read again
  if (X.loading) { if (!fresh) return X.loading; await X.loading.catch(() => {}); if (X.loading) return X.loading; }
  let run = null;
  run = X.loading = (async () => {
    try {
      const j = await el('list');
      const was = JSON.stringify(X.shows);
      X.shows = j.shows || []; if (j.searches) X.searches = j.searches;
      if (j.usage) X.usage = C.usage(j.usage);
      X.loaded = true; X.loadedAt = Date.now(); X.err = ''; X.offline = '';
      if (X.shared) { const p = X.shared; X.shared = null; setTimeout(() => openAddShow(p), 50); }
      if (was !== JSON.stringify(X.shows) || !quiet) { refresh(); refreshSettings(); }
      return true;
    } catch (e) {
      if (isGone(e)) return false;
      if (!X.loaded) { X.err = elErr(e); X.errKind = e && e.kind; } else X.offline = errText(e);
      refresh();
      return false;
    } finally { if (X.loading === run) X.loading = false; }   // only its own: a newer read may be on its way
  })();
  return run;
}
async function loadPipeAll(force) {
  if (X.pipeAllLoading) return X.pipeAllLoading;
  if (!force && X.pipeAll && Date.now() - X.pipeAllAt < 60000) return;
  let run = null;
  run = X.pipeAllLoading = (async () => {
    try { const j = await hq('pipelineShows'); X.pipeAll = { shows: j.shows || {}, ready: !!j.pipelineReady }; X.pipeAllAt = Date.now(); refresh(); }
    catch (e) { if (!isGone(e) && !X.pipeAll) X.pipeAll = { shows: {}, ready: false, err: errText(e) }; }
    finally { if (X.pipeAllLoading === run) X.pipeAllLoading = null; }
  })();
  return run;
}
function loadPipe(id) {
  const was = X.pipe[id] || {};
  if (was.loading) return was.loading;
  const run = (async () => {
    try { const j = await hq('pipelineFor', { showId: id }); X.pipe[id] = { data: j, at: Date.now() }; }
    catch (e) {
      if (isGone(e)) { if (X.pipe[id] && X.pipe[id].loading === run) delete X.pipe[id].loading; return; }
      X.pipe[id] = { data: was.data || null, at: was.at || 0, err: errText(e) };
    }
    if (onShow(id)) updateShowParts();
  })();
  X.pipe[id] = Object.assign({}, was, { loading: run });
  return run;
}
async function fetchRows(id) {
  const j = await el('rows', { showId: id });
  X.rows[id] = j.rows || []; X.rowsAt[id] = Date.now();
  syncCounts(id); X.offline = '';
}
function syncCounts(id) { const s = showById(id); if (s && X.rows[id]) s.counts = C.countRows(X.rows[id]); }
function mergeRows(id, changed) {
  if (!changed || !changed.length) return;
  const list = X.rows[id] || (X.rows[id] = []);
  const at = new Map(list.map((r, i) => [r.id, i]));
  changed.forEach((r) => {
    if (at.has(r.id)) { const old = list[at.get(r.id)]; if (old && old.alsoIn && !r.alsoIn) r.alsoIn = old.alsoIn; list[at.get(r.id)] = r; }
    else { at.set(r.id, list.length); list.push(r); }
  });
  syncCounts(id);
}
async function checkBuild() {
  if (X.build != null) return;
  try { const j = await el('ping', null, 20000); X.build = +j.build || 0; refreshNotices(); } catch (e) { /* offline: try next time */ }
}
async function loadStatus() {
  if (X.statusLoading) return;
  const g = gen;
  X.statusLoading = true;
  X.statusErr = '';
  try { const j = await el('status'); X.status = j; X.statusAt = Date.now(); if (j.usage) X.usage = C.usage(j.usage); } catch (e) { if (isGone(e)) { if (g === gen) X.statusLoading = false; return; } X.statusErr = errText(e); }
  X.statusLoading = false;
  refreshSettings();
  refreshNotices();
}
function refreshSettings() { const box = document.getElementById('xset-body'); if (box) box.innerHTML = settingsBody(); }
const rowById = (id) => { const l = X.rows[X.route.id] || []; return l.find((r) => r.id === id); };
const pipeSum = (id) => (X.pipeAll && X.pipeAll.shows && own(X.pipeAll.shows, id) ? X.pipeAll.shows[id] : null);
const pipeData = (id) => (X.pipe[id] && X.pipe[id].data) || null;
const pipeRow = (r) => { const d = pipeData(r.showId); return d && d.rows && own(d.rows, r.id) ? d.rows[r.id] : null; };
const needsCall = (pr) => !!pr && pr.can === 'Check' && !pr.touches;

/* ---------- Routes ---------- */
function parse(hash) {
  const h = String(hash || '').replace(/^#\/exhibitors\/?/, '');
  const [path, query] = h.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch (e) { return ''; } });
  if (parts[0] === 's' && parts[1]) return { v: 'sector', sector: parts[1] };
  if (parts[0] === 'd' && parts[1]) return { v: 'diary', sector: parts[1] };
  if (parts[0] === 'x' && parts[1]) return { v: 'show', id: parts[1] };
  if (parts[0] === 'add') return { v: 'home', add: query || '' };
  return { v: 'home' };
}
const onShow = (id) => api && api.isHere() && X.route.v === 'show' && X.route.id === id;
const here = () => api && api.isHere() && document.visibilityState === 'visible';

/* ---------- The page ---------- */
function html(hash) {
  const r = parse(hash);
  const key = JSON.stringify([r.v, r.id || r.sector || '']);
  if (key !== X.routeKey) {
    if (X.routeKey) closeDialog();
    X.routeKey = key; X.filter = X.nextFilter || 'all'; X.nextFilter = ''; X.q = ''; X.limit = 200; X.sel = null; E.userPaused = false;
    if (r.v === 'diary' && X.diaryFor !== r.sector) { X.diaryQ = ''; X.diaryType = 'all'; X.diaryFor = r.sector; }
  }
  if (r.add != null) {
    const q = new URLSearchParams(r.add);
    const p = C.parseShared({ title: q.get('title'), text: q.get('text'), url: q.get('url') });
    if (p.url || p.name) X.shared = p;
    history.replaceState(null, '', '#/exhibitors');
  }
  X.route = r;
  if (!api.elUrl()) {
    return pageHead({ title: 'Exhibitors' }) + (api.helloDone()
      ? gatePanel('Add Exhibitor Leads to HQ', 'In HQ’s Apps Script, open Project Settings → Script Properties and add <b>EL_URL</b>: the Exhibitor Leads web app address, ending /exec. Then reload HQ.')
      : api.helloFailed() ? gatePanel('Exhibitors opens once HQ reaches its script', 'Use Try again in the message above.')
      : gatePanel('Opening Exhibitors…', '<span class="spinner"></span>'));
  }
  if (!X.loaded) {
    if (X.err) return pageHead({ title: 'Exhibitors' }) + gatePanel('Exhibitors didn’t open', esc(X.err), '<button class="btn small" type="button" data-xa="retry">Try again</button>');
    return pageHead({ title: 'Exhibitors' }) + gatePanel('Opening Exhibitors…', '<span class="spinner"></span> Reading your exhibitions from Exhibitor Leads.');
  }
  if (r.v === 'sector') return pageSector(r.sector);
  if (r.v === 'diary') return pageDiary(r.sector);
  if (r.v === 'show') return pageShow(r.id);
  return pageHome();
}
function bind(main) {
  main.onclick = onClick;
  main.onsubmit = onSubmit;
  main.oninput = onInput;
  main.onkeydown = onKey;
  if (!api.elUrl()) return;
  if (!X.loaded) { if (!X.err) loadShows(); return; }
  if (Date.now() - X.loadedAt > 30000) loadShows(true);
  loadPipeAll();
  checkBuild();
  if (!X.status) loadStatus();
  const r = X.route;
  if (r.v === 'show') enterShow(r.id);
  else if (r.v === 'diary' || r.v === 'sector') { const f = C.diaryFile(r.sector); if (f) loadDiary(r.sector); }
  if (r.v !== 'show') ensureChecking();
  if (X.shared) { const p = X.shared; X.shared = null; setTimeout(() => openAddShow(p), 50); }
}
async function enterShow(id) {
  const s = showById(id);
  if (!s) return;
  if (s.sector && C.diaryFile(s.sector)) loadDiary(s.sector);
  if (!X.pipe[id] || Date.now() - (X.pipe[id].at || 0) > 60000) loadPipe(id);
  if (!X.rows[id] || Date.now() - (X.rowsAt[id] || 0) > 30000) {
    try { await fetchRows(id); } catch (e) { if (isGone(e)) return; X.offline = errText(e); }
    if (onShow(id)) updateShowParts();
  }
  ensureChecking();
}
/** Redraw what's on screen after data changes, without losing what you're typing. */
function refresh() {
  if (!api || !api.isHere()) return;
  const r = X.route;
  const anchor = r.v === 'show' ? 'xs-top' : r.v === 'diary' ? 'xd-root' : 'xbody';
  if (!X.loaded || !document.getElementById(anchor)) { if (r.v !== 'show' || !X.loaded || showById(r.id)) api.rerender(); return; }
  refreshNotices();
  if (r.v === 'show') updateShowParts();
  else if (r.v === 'diary') { if (document.getElementById('xd-list')) setHtml('xd-list', diaryList(r.sector)); }
  else setHtml('xbody', r.v === 'sector' ? sectorBody(r.sector) : homeBody());
}
function refreshNotices() { setHtml('xnotices', notices()); }

function pageHead(o) {
  const crumbs = o.crumbs ? `<nav class="crumbs" aria-label="Where you are">${o.crumbs.map((c) => (c[1] ? `<a href="${esc(c[1])}">${esc(c[0])}</a>` : `<span>${esc(c[0])}</span>`)).join('<span class="sep">/</span>')}</nav>`
    : `<span class="eyebrow live"><span class="pulse${X.offline ? ' off' : ''}"></span>Exhibitors</span>`;
  return `<header class="page-head"${o.lc ? ` style="--lc:${o.lc}"` : ''}><div>${crumbs}
    <h1 class="h1">${o.lc ? '<span class="ldot2" aria-hidden="true"></span>' : ''}${esc(o.title)}</h1>${o.lede ? `<p class="lede">${o.lede}</p>` : ''}</div>
    ${o.actions ? `<div class="actions"${o.actionsId ? ` id="${o.actionsId}"` : ''}>${o.actions}</div>` : ''}</header><div id="xnotices">${notices()}</div>`;
}
function gatePanel(title, body, actions) {
  return `<section class="panel" style="max-width:640px"><h2 class="h3">${esc(title)}</h2><p class="sub" style="margin:0">${body}</p>${actions ? `<div class="actions">${actions}</div>` : ''}</section>`;
}
function notices() {
  const out = [];
  if (X.offline) out.push(`<div class="banner" role="alert"><span class="grow">${esc(X.offline)} Showing what was loaded earlier.</span><button class="btn small" type="button" data-xa="retry">Retry</button></div>`);
  if (X.build != null && C.scriptOutdated(X.build, EXPECT_EL)) out.push(`<div class="banner"><span class="grow">Your Exhibitor Leads script is ${X.build ? 'release ' + esc(X.build) : 'an older release'}; HQ needs ${EXPECT_EL}. Paste its new Code.gs and deploy a new version, or the newer checks won’t run.</span></div>`);
  if (X.usage && X.usage.warn && X.usageHidden !== X.usage.message.replace(/\d+%/, '')) out.push(`<div class="banner"><span class="grow">${esc(X.usage.message)}</span><button class="btn small" type="button" data-xa="hide-usage">Hide</button></div>`);
  return out.join('');
}
function searchBox() {
  return `<form class="xfind" id="xfind" role="search" autocomplete="off"><label class="xsearch">${I.search}<span class="sr">Find a sector or exhibition</span>
    <input id="xfind-in" placeholder="Find a sector or exhibition" enterkeyhint="go" maxlength="60"></label><div class="xfind-list" id="xfind-list" hidden></div></form>`;
}

/* ---------- Home ---------- */
function totals(shows) {
  const t = { total: 0, done: 0, corporate: 0, consent: 0, check: 0, google: 0, microsoft: 0, pending: 0 };
  shows.forEach((s) => { const c = s.counts || {}; Object.keys(t).forEach((k) => { t[k] += c[k] || 0; }); });
  return t;
}
function pageHome() {
  const sectors = C.sectorsFrom(X.shows), t = totals(X.shows);
  return pageHead({ title: 'Exhibitors',
    lede: X.shows.length ? `${plural(X.shows.length, 'exhibition')} in ${plural(sectors.length, 'sector')}. <span class="hl">${commas(t.corporate)}</span> of ${commas(t.total)} exhibitors you can email without asking first.`
      : 'Choose a sector such as baby, whisky or crafts, find its shows, and HQ reads each exhibitor list for you.',
    actions: searchBox() + `<button class="btn yellow" type="button" data-xa="add-show">${I.plus}Add exhibition</button>` }) + `<div id="xbody">${homeBody()}</div>`;
}
function homeBody() {
  const sectors = C.sectorsFrom(X.shows), t = totals(X.shows);
  if (!X.shows.length) {
    return `<section class="panel" style="max-width:720px"><span class="eyebrow">Getting started</span><h2 class="h2">Who are you selling to?</h2>
      <p class="sub" style="margin:0">Type a sector in Find, such as Baby and toddler or Christmas fairs. Its page has searches, listings and, for some sectors, a researched show diary. Then add a show by its website and HQ reads its exhibitor list.</p>
      <div class="actions"><button class="btn yellow" type="button" data-xa="add-show">${I.plus}Add exhibition</button></div></section>`;
  }
  const soon = X.shows.filter((s) => { const a = C.dayNum(s.start), n = C.dayNum(today()); return !isNaN(a) && a >= n && a - n <= 21; }).length;
  const ps = X.pipeAll ? Object.keys(X.pipeAll.shows).map((k) => X.pipeAll.shows[k]) : [];
  const inPipe = ps.reduce((a, p) => a + p.imported, 0), emailed = ps.reduce((a, p) => a + p.emailed, 0);
  const calls = callsList();
  const callsN = calls.reduce((a, c) => a + c.n, 0);
  return `<section class="kpis" aria-label="Your exhibitors at a glance">
      <div class="kpi"><div class="kpi-top"><span>Exhibitions</span><span>${plural(sectors.length, 'sector')}</span></div><div class="kpi-val">${commas(X.shows.length)}</div><div class="kpi-sub"><b>${soon}</b> in the next 3 weeks</div></div>
      <div class="kpi"><div class="kpi-top"><span>Exhibitors</span><span>checked</span></div><div class="kpi-val">${commas(t.total)}</div><div class="kpi-sub">${t.pending ? `<b>${commas(t.done)}</b> checked · ${commas(t.pending)} waiting` : 'All checked'}</div>${miniBar([['ok-bg', t.done], ['pending-bg', t.pending]])}</div>
      <div class="kpi"><div class="kpi-top"><span>Can email</span><span>${pct(t.corporate, t.done)}</span></div><div class="kpi-val">${commas(t.corporate)}</div><div class="kpi-sub">Limited companies, confirmed</div>${miniBar([['ok-bg', t.corporate], ['check-bg', t.check], ['consent-bg', t.consent]])}</div>
      ${callsN ? `<a class="kpi call" href="${esc(hashFor.show(calls[0].id))}" data-xcalls="${esc(calls[0].id)}"><div class="kpi-top"><span>Your calls</span><span>Companies House</span></div><div class="kpi-val">${commas(callsN)}</div><div class="kpi-sub">${esc(calls.slice(0, 2).map((c) => shortName(c.name) + ' ' + c.n).join(' · '))}</div></a>`
        : `<div class="kpi"><div class="kpi-top"><span>Your calls</span><span>Companies House</span></div><div class="kpi-val">0</div><div class="kpi-sub">${X.pipeAll ? 'Nothing waiting on you' : 'Reading the pipeline…'}</div></div>`}
      <div class="kpi"><div class="kpi-top"><span>In the pipeline</span><span>all shows</span></div><div class="kpi-val">${X.pipeAll ? commas(inPipe) : '…'}</div><div class="kpi-sub">${X.pipeAll ? `<b>${commas(emailed)}</b> emailed so far` : 'Reading the pipeline…'}</div></div>
    </section>
    <div class="ov-grid"><div class="ov-main">
      <section class="panel" aria-labelledby="lines-h"><div class="panel-head"><div><span class="eyebrow">Sectors</span><h2 class="h2" id="lines-h">Your lines</h2>
        <span class="sub small">Each sector is a line, and its shows are the stops, in date order. Open one for its exhibitions, diary and searches.</span></div></div>
        <div class="lines">${sectors.map(sectorLine).join('')}</div></section>
      ${reachPanel('All sectors', t)}
    </div><div class="ov-side">
      ${callsTicket(calls, callsN)}
      ${checkingPanel(X.shows)}
      ${findPanel(null)}
    </div></div>`;
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '');
function miniBar(parts) { const list = parts.filter((p) => p[1] > 0); return list.length ? `<div class="mini" aria-hidden="true">${list.map((p) => `<i class="${p[0]}" style="flex-grow:${p[1]}"></i>`).join('')}</div>` : ''; }
function shortName(n) { const s = String(n || ''); return s.length > 26 ? s.slice(0, 24) + '…' : s; }
function callsList() {
  if (!X.pipeAll) return [];
  return Object.keys(X.pipeAll.shows).map((id) => ({ id, n: X.pipeAll.shows[id].calls, name: (showById(id) || {}).name })).filter((c) => c.n > 0 && c.name).sort((a, b) => b.n - a.n);
}
function callsTicket(calls, n) {
  if (!n) return '';
  return `<section class="ticket" aria-labelledby="calls-h"><span class="t-top"><span class="round">${commas(n)}</span><span class="t-tag">YOUR CALLS · COMPANIES HOUSE</span></span>
    <b class="t-title" id="calls-h">Decide ${plural(n, 'business', 'businesses')}</b>
    <span class="t-sub">The pipeline won’t email them until you say: a limited company, or consent needed.</span>
    <div class="calls">${calls.slice(0, 8).map((c) => `<a class="call-row" href="${esc(hashFor.show(c.id))}" data-xcalls="${esc(c.id)}">${esc(c.name)}<span class="round">${commas(c.n)}</span></a>`).join('')}</div></section>`;
}
function stationsFor(shows) {
  const t = C.dayNum(today());
  const end = (s) => { const a = C.dayNum(s.start); let b = C.dayNum(s.end); if (isNaN(b) || b < a) b = a; return b; };
  const up = shows.filter((s) => !isNaN(C.dayNum(s.start)) && end(s) >= t).sort((a, b) => C.dayNum(a.start) - C.dayNum(b.start));
  const past = shows.filter((s) => !isNaN(C.dayNum(s.start)) && end(s) < t).sort((a, b) => C.dayNum(b.start) - C.dayNum(a.start));
  let pick = up.slice(0, 3);
  if (pick.length < 3) pick = past.slice(0, 3 - pick.length).reverse().concat(pick);
  // shows with no dates yet come last, so a line is never empty
  if (pick.length < 3) pick = pick.concat(shows.filter((s) => isNaN(C.dayNum(s.start))).slice(0, 3 - pick.length));
  return pick;
}
function whenLabel(s) {
  const t = C.dayNum(today()), a = C.dayNum(s.start);
  if (isNaN(a)) return 'DATES NOT SET';
  let b = C.dayNum(s.end); if (isNaN(b) || b < a) b = a;
  const d = C.fmtDates(s.start, s.end).toUpperCase();
  if (a <= t && t <= b) return 'ON NOW · ' + d;
  if (a - t === 1) return 'TOMORROW · ' + d;
  return d;
}
function stationClass(s) {
  const t = C.dayNum(today()), a = C.dayNum(s.start); let b = C.dayNum(s.end); if (isNaN(b) || b < a) b = a;
  return isNaN(a) ? '' : b < t ? 'past' : a - t <= 2 ? 'now' : '';
}
function pipeTag(s) {
  const c = s.counts || {}, p = pipeSum(s.id);
  const checking = ['yellow', `CHECKING · ${commas(c.done)} OF ${commas(c.total)}`];
  if (!c.total) return ['muted', 'NO EXHIBITORS YET'];
  if (!X.pipeAll) return c.pending ? checking : ['muted', '…'];
  if (!p || !p.imported) return c.pending ? checking : ['muted', 'NOT IN THE PIPELINE'];
  // In the pipeline: its batch says most, then calls waiting on you, then checks still running here
  const b = p.batches.filter((x) => x.status === 'Started')[0] || p.batches[0];
  if (b) return [b.status === 'Started' ? 'mint' : 'sky', `${b.id} · ${STEP_WORDS[b.stage] || b.stage} · ${b.status === 'Ready' ? 'NOT STARTED' : b.status}`.toUpperCase()];
  if (p.calls) return ['yellow', `${commas(p.calls)} YOUR CALLS`];
  if (c.pending) return checking;
  return ['sky', `${commas(p.imported)} IN THE PIPELINE`];
}
function sectorLine(sec) {
  const shows = X.shows.filter((s) => (s.sector || 'General') === sec.name);
  const t = totals(shows), picks = stationsFor(shows), more = shows.length - picks.length;
  const st = (s) => { const tag = pipeTag(s); return `<div class="station ${stationClass(s)}"><span class="st"></span><small>${esc(whenLabel(s))}</small><b>${esc(s.name)}</b>
    <span>${esc([s.venue, (s.counts || {}).total ? plural((s.counts || {}).total, 'exhibitor') : ''].filter(Boolean).join(' · '))}</span><span class="ftag ${tag[0]}">${esc(tag[1])}</span></div>`; };
  return `<a class="sline" href="${esc(hashFor.sector(sec.name))}" style="--lc:${lineOf(sec.name)}">
    <div class="sline-head"><div><b>${esc(sec.name)}</b><span class="sub">${plural(sec.shows, 'exhibition')} · ${plural(sec.total, 'exhibitor')} · <span style="color:var(--mint)">${commas(sec.corporate)} can email</span></span></div>
    <div class="sline-bar"><div class="lbar thin" aria-hidden="true">${bars([['ok-bg', t.corporate], ['check-bg', t.check], ['consent-bg', t.consent], ['pending-bg', t.pending]])}</div><small>CAN EMAIL · TO CHECK · CONSENT</small></div></div>
    <div class="stations">${picks.map(st).join('')}${more > 0 ? `<div class="station"><span class="st"></span><small>MORE</small><b>${plural(more, 'more exhibition')}</b><span>Open the line for all of them</span></div>` : ''}</div></a>`;
}
function bars(parts) { return parts.filter((p) => p[1] > 0).map((p) => `<i class="${p[0]}" style="flex-grow:${p[1]}"></i>`).join(''); }
function reachPanel(what, t) {
  const other = Math.max(0, t.done - t.google - t.microsoft);
  return `<section class="panel"><div class="panel-head"><div><span class="eyebrow">${esc(what)}</span><h2 class="h3">Who you can reach</h2></div></div>
    <div class="two-bars"><div><span class="eyebrow">Can you email them?</span>
      <div class="lbar" role="img" aria-label="${esc(`Can email ${t.corporate}, to check ${t.check}, consent needed ${t.consent}`)}">${bars([['ok-bg', t.corporate], ['check-bg', t.check], ['consent-bg', t.consent], ['pending-bg', t.pending]])}</div>
      <div class="keys"><span><i class="ok-bg"></i><b>${commas(t.corporate)}</b> can email ${t.done ? '(' + pct(t.corporate, t.done) + ')' : ''}</span><span><i class="check-bg"></i><b>${commas(t.check)}</b> to check</span><span><i class="consent-bg"></i><b>${commas(t.consent)}</b> consent needed</span>${t.pending ? `<span><i class="pending-bg"></i><b>${commas(t.pending)}</b> being checked</span>` : ''}</div></div>
    <div><span class="eyebrow">Who runs their email?</span>
      <div class="lbar" role="img" aria-label="${esc(`Google ${t.google}, Microsoft ${t.microsoft}, other or not known ${other}`)}">${bars([['g-bg', t.google], ['m-bg', t.microsoft], ['o-bg', other]])}</div>
      <div class="keys"><span><i class="g-bg"></i><b>${commas(t.google)}</b> Google</span><span><i class="m-bg"></i><b>${commas(t.microsoft)}</b> Microsoft</span><span><i class="o-bg"></i><b>${commas(other)}</b> other or not known</span></div></div></div></section>`;
}
function checkingPanel(shows) {
  const waiting = shows.filter((s) => (s.counts || {}).pending > 0);
  const per = X.status && X.status.speed && X.status.speed.seconds;
  const running = E.running && E.showId === '*' && !E.stop;
  if (!waiting.length) {
    const t = totals(shows);
    return t.total ? `<section class="panel"><div class="panel-head"><div><span class="eyebrow">Checks</span><h2 class="h3">All ${commas(t.total)} checked</h2></div></div><p class="note" style="margin:0">New exhibitors are checked as they come in: websites, mail and Companies House. The background run carries on every 10 minutes when HQ is closed.</p></section>` : '';
  }
  return `<section class="panel" aria-labelledby="chk-h"><div class="panel-head"><div><span class="eyebrow live"><span class="pulse${running ? '' : ' off'}"></span>${running ? 'Checking now' : 'Waiting to be checked'}</span><h2 class="h3" id="chk-h">Websites, mail and Companies House</h2></div>
    <button class="run-btn${running ? '' : ' off'}" type="button" data-xa="${running ? 'pause' : 'resume'}" aria-label="${running ? 'Pause checking' : 'Keep checking'}">${running ? I.pause : I.play}</button></div>
    ${waiting.slice(0, 6).map((s) => { const c = s.counts; return `<div class="chk"><div class="chk-top"><div><b><a href="${esc(hashFor.show(s.id))}" style="color:var(--text);text-decoration:none">${esc(s.name)}</a></b><span>${commas(c.done)} of ${commas(c.total)} checked · ${esc(C.waitingLine(c.pending, per, running))}</span></div></div>
      <div class="lbar thin" aria-hidden="true">${bars([['ok-bg', c.corporate], ['check-bg', c.check], ['consent-bg', c.consent], ['pending-bg', c.pending]])}</div></div>`; }).join('')}
    <p class="note" style="margin:0">The background run carries on every 10 minutes when HQ is closed.</p></section>`;
}
function findPanel(sector) {
  const linkRow = (href, tile, name, sub, ext, extra) => `<div class="link-wrap"><a class="link-row" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}><span class="tl">${esc(tile)}</span><div><b>${esc(name)}</b><span>${esc(sub)}</span></div>${ext ? I.out : I.chev}</a>${extra || ''}</div>`;
  let rows = '';
  if (!sector) {
    const diaries = C.sectorsFrom(X.shows).filter((s) => C.diaryFile(s.name));
    rows = diaries.map((s) => linkRow(hashFor.diary(s.name), 'DY', `${s.name}: show diary`, 'Researched dates, venues and attendance', false)).join('')
      + `<p class="note" style="margin:6px 0 0">Open a sector for its listings sites and Google searches.</p>`;
  } else {
    const pages = C.finderPages(sector, (X.searches || {})[String(sector).toLowerCase()]);
    rows = pages.map((p) => linkRow(p.url, p.tile, p.name, p.sub, true, p.mine ? `<button class="icon-btn" type="button" data-xa="remove-search" data-url="${esc(p.url)}" aria-label="Remove ${esc(p.name)}">${I.x}</button>` : '')).join('')
      + C.searchLinks(sector).map((l) => linkRow(l.url, 'G', l.label, 'Google search', true)).join('');
  }
  return `<section class="panel" aria-labelledby="find-h"><div class="panel-head"><div><span class="eyebrow">Find exhibitions</span><h2 class="h3" id="find-h">${sector ? 'Listings and searches' : 'How a show gets in'}</h2></div>
    ${sector ? `<button class="icon-btn" type="button" data-xa="add-search" aria-label="Save a search page" title="Save a search page">${I.plus}</button>` : ''}</div>
    ${sector ? '' : '<ol class="xhow"><li><small>1 · BROWSE</small>A listings site or a show diary</li><li><small>2 · OPEN</small>The show’s own website</li><li><small>3 · ADD</small>Paste or share its address to HQ</li></ol>'}
    <div class="links">${rows}</div>
    <p class="note" style="margin:0">HQ never reads listings sites: they ask that only people browse them. It reads a show’s own site when you add it, where the site allows.</p></section>`;
}

/* ---------- A sector ---------- */
function pageSector(sector) {
  const shows = X.shows.filter((s) => s.sector === sector);
  const t = totals(shows), lc = lineOf(sector);
  return pageHead({ crumbs: [['Exhibitors', hashFor.home()], [sector]], title: sector, lc,
    lede: shows.length ? `${plural(shows.length, 'exhibition')} · ${plural(t.total, 'exhibitor')} · <span class="hl">${commas(t.corporate)}</span> you can email` : 'No exhibitions here yet. Use the searches and listings to find some, then add them.',
    actions: (C.diaryFile(sector) ? `<a class="btn" href="${esc(hashFor.diary(sector))}">Show diary</a>` : '')
      + (shows.length ? `<button class="btn" type="button" data-xa="rename-sector">Rename</button>` : '')
      + (t.total ? `<button class="icon-sq" type="button" data-xa="sector-csv" aria-label="Download this sector as CSV" title="Download CSV">${I.down}</button>` : '')
      + `<button class="btn yellow" type="button" data-xa="add-show">${I.plus}Add exhibition</button>` }) + `<div id="xbody">${sectorBody(sector)}</div>`;
}
function sectorBody(sector) {
  const shows = X.shows.filter((s) => s.sector === sector);
  const t = totals(shows);
  const calls = callsList().filter((c) => (showById(c.id) || {}).sector === sector), callsN = calls.reduce((a, c) => a + c.n, 0);
  const groups = C.groupShows(shows, today());
  const week = shows.filter((s) => stationClass(s) === 'now').length;
  return `${shows.length ? `<section class="kpis" aria-label="${esc(sector)} at a glance">
      <div class="kpi"><div class="kpi-top"><span>Exhibitions</span><span>sector</span></div><div class="kpi-val">${shows.length}</div><div class="kpi-sub">${week ? `<b>${week}</b> on now or in 2 days` : `${groups.filter((g) => g.id === 'upcoming').reduce((a, g) => a + g.shows.length, 0)} coming up`}</div></div>
      <div class="kpi"><div class="kpi-top"><span>Exhibitors</span><span>checked</span></div><div class="kpi-val">${commas(t.total)}</div><div class="kpi-sub">${t.pending ? `${commas(t.done)} checked · ${commas(t.pending)} waiting` : 'All checked'}</div>${miniBar([['ok-bg', t.done], ['pending-bg', t.pending]])}</div>
      <div class="kpi"><div class="kpi-top"><span>Can email</span><span>${pct(t.corporate, t.done)}</span></div><div class="kpi-val">${commas(t.corporate)}</div><div class="kpi-sub">Limited companies, confirmed</div>${miniBar([['ok-bg', t.corporate], ['check-bg', t.check], ['consent-bg', t.consent]])}</div>
      ${callsN ? `<a class="kpi call" href="${esc(hashFor.show(calls[0].id))}" data-xcalls="${esc(calls[0].id)}"><div class="kpi-top"><span>Your calls</span><span>Companies House</span></div><div class="kpi-val">${callsN}</div><div class="kpi-sub">${esc(calls.slice(0, 2).map((c) => shortName(c.name) + ' ' + c.n).join(' · '))}</div></a>`
        : `<div class="kpi"><div class="kpi-top"><span>Your calls</span><span>Companies House</span></div><div class="kpi-val">0</div><div class="kpi-sub">${X.pipeAll ? 'Nothing waiting on you' : 'Reading the pipeline…'}</div></div>`}
    </section>` : ''}
    <div class="ov-grid"><div class="ov-main">
      <section class="panel" aria-labelledby="ex-h" style="--lc:${lineOf(sector)}"><div class="panel-head"><div><span class="eyebrow">The line</span><h2 class="h2" id="ex-h">Exhibitions</h2>
        <span class="sub small">Go brings a show’s checked exhibitors into the pipeline, then makes a fast-lane batch of the P1 and P2 ones for you to start.</span></div></div>
        ${shows.length ? `<div class="tbox"><table class="xt"><thead><tr><th scope="col">Exhibition</th><th scope="col">Dates</th><th scope="col">Exhibitors</th><th scope="col" class="r">Can email</th><th scope="col">Pipeline</th><th scope="col"><span class="sr">Action</span></th></tr></thead><tbody>
        ${groups.map((g) => `<tr class="grp"><td colspan="6">${esc(g.id === 'upcoming' ? 'Coming up' : g.label)}</td></tr>${g.shows.map(showTableRow).join('')}`).join('')}</tbody></table></div>`
          : `<p class="sub" style="margin:0">No exhibitions yet. Find one with the searches on the right, open its own website, then add it.</p>`}
      </section>
      ${shows.length ? reachPanel(sector, t) : ''}
      ${checkingPanel(shows)}
    </div><div class="ov-side">
      ${diaryTeaser(sector)}
      ${findPanel(sector)}
    </div></div>`;
}
function showTableRow(s) {
  const c = s.counts || {}, tag = pipeTag(s), p = pipeSum(s.id);
  const bad = s.status === 'blocked' || s.status === 'empty' || s.status === 'error';
  const cnt = c.total ? (c.pending ? `${commas(c.done)} of ${commas(c.total)} checked` : `${commas(c.total)} · all checked`) : bad ? 'Needs a pasted list' : s.urls && s.urls.length ? 'Not loaded yet' : 'No list link yet';
  let act;
  if (!c.total) act = s.urls && s.urls.length && !bad ? `<button class="btn small" type="button" data-xa="load" data-id="${esc(s.id)}">Load list</button>` : `<button class="btn small" type="button" data-xa="paste" data-id="${esc(s.id)}">Paste list</button>`;
  else if (X.pipeAll && X.pipeAll.ready && (!p || !p.imported) && c.done) act = `<button class="btn small yellow" type="button" data-xa="go" data-id="${esc(s.id)}">Go</button>`;
  else act = `<a class="btn small" href="${esc(hashFor.show(s.id))}">Open</a>`;
  const extra = p && p.calls ? `<span class="ftag yellow">${commas(p.calls)} YOUR CALLS</span>` : '';
  return `<tr><td><div class="nm"><b><a class="rowlink" href="${esc(hashFor.show(s.id))}">${esc(s.name)}</a></b><span>${esc(s.venue || '')}</span></div></td>
    <td style="white-space:nowrap">${esc(C.fmtDates(s.start, s.end))}</td>
    <td><div class="cnt-bar"><span>${esc(cnt)}</span><div class="lbar thin" aria-hidden="true">${c.total ? bars([['ok-bg', c.corporate], ['check-bg', c.check], ['consent-bg', c.consent], ['pending-bg', c.pending]]) : '<i class="pending-bg" style="flex-grow:1"></i>'}</div></div></td>
    <td class="r" style="${c.corporate ? 'color:var(--mint);font-weight:700' : 'color:var(--muted)'}">${c.total ? commas(c.corporate) : '–'}</td>
    <td><div class="tags"><span class="ftag ${tag[0]}">${esc(tag[1])}</span>${tag[1].indexOf('YOUR CALLS') < 0 ? extra : ''}</div></td>
    <td class="r">${act}</td></tr>`;
}
const MONS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function dayMon(iso) { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? +m[2] + ' ' + MONS[+m[1] - 1] : 'TBC'; }
function diaryTeaser(sector) {
  const file = C.diaryFile(sector);
  if (!file) return '';
  const d = diaryData(sector);
  if (!d) return `<section class="panel"><div class="panel-head"><div><span class="eyebrow">Show diary</span><h2 class="h3">${X.diaryFail[file] ? 'The diary didn’t load' : 'Opening the show diary…'}</h2></div></div>${X.diaryFail[file] ? '<button class="btn small" type="button" data-xa="diary-retry" style="align-self:flex-start">Try again</button>' : ''}</section>`;
  const v = C.diaryView(d, { type: 'all' }, today(), X.shows);
  const next = [];
  v.groups.forEach((g) => g.items.forEach((e) => { if (!e.added && !e.series && next.length < 5) next.push(e); }));
  return `<section class="panel" aria-labelledby="dy-h"><div class="panel-head"><div><span class="eyebrow">Show diary</span><h2 class="h3" id="dy-h">${plural(v.total, 'show')} to research</h2><span class="sub small">Researched dates, venues and attendance. Add one and its site is read for you.</span></div></div>
    <div class="arrs">${next.map((e) => `<div class="arr"><span class="mono muted">${esc(dayMon(e.start))}</span><span class="ftag ${DIARY_MARK[e.dates] || 'muted'}" title="${esc((C.DIARY_DATES[e.dates] || C.DIARY_DATES.tbc).help)}">${esc(String((C.DIARY_DATES[e.dates] || C.DIARY_DATES.tbc).label).split(/[ ,]/)[0].toUpperCase())}</span>
      <span class="arr-tx"><b>${esc(C.diaryName(e))}</b><span>${esc(e.venue || e.when || '')}</span></span></div>`).join('')}</div>
    <a class="btn small" href="${esc(hashFor.diary(sector))}" style="align-self:flex-start">Open the diary</a></section>`;
}

/* ---------- Show diary ---------- */
function diaryData(sector) { const f = C.diaryFile(sector); return f ? X.diaries[f] || null : null; }
async function loadDiary(sector, force) {
  const file = C.diaryFile(sector);
  if (!file || X.diaries[file] || X.diaryLoading[file] || (X.diaryFail[file] && !force)) return;
  X.diaryLoading[file] = true;
  try {
    const r = await fetch('exhibitors/' + file, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || !Array.isArray(j.shows)) throw new Error('not a diary');
    X.diaries[file] = j; X.diaryFail[file] = false;
  } catch (e) { X.diaryFail[file] = true; }
  X.diaryLoading[file] = false;
  if (api.isHere()) { if (X.route.v === 'diary') api.rerender(); else refresh(); }
}
const DIARY_MARK = { organiser: 'mint', listing: 'yellow', tbc: 'muted' };
function pageDiary(sector) {
  const d = diaryData(sector), lc = lineOf(sector);
  const head = pageHead({ crumbs: [['Exhibitors', hashFor.home()], [sector, hashFor.sector(sector)], ['Show diary']], title: 'Show diary', lc,
    lede: esc(d ? (d.about || `Shows to research for ${sector}`) : `Shows to research for ${sector}`) });
  const failed = X.diaryFail[C.diaryFile(sector)];
  if (!d) return head + `<div id="xd-root">${gatePanel(failed ? 'The show diary didn’t load' : 'Opening the show diary…', failed ? 'Check your connection, then try again.' : '<span class="spinner"></span>', failed ? '<button class="btn small" type="button" data-xa="diary-retry">Try again</button>' : '')}</div>`;
  let v = C.diaryView(d, { type: X.diaryType }, today(), X.shows);
  if (X.diaryType !== 'all' && !v.counts[X.diaryType]) { X.diaryType = 'all'; v = C.diaryView(d, { type: 'all' }, today(), X.shows); }
  const chip = (id, label) => `<button class="fchip" type="button" data-xa="diary-type" data-type="${esc(id)}" aria-pressed="${X.diaryType === id}">${esc(label)} <span class="n">${v.counts[id] || 0}</span></button>`;
  const key = Object.keys(C.DIARY_DATES).map((k) => `<span class="ftag ${DIARY_MARK[k]}" title="${esc(C.DIARY_DATES[k].help)}">${esc(C.DIARY_DATES[k].label.toUpperCase())}</span>`).join('');
  return head + `<section class="panel" id="xd-root" style="--lc:${lc}">
    <div class="tools-row"><div class="fchips" role="group" aria-label="Type of show">${chip('all', 'All')}${C.diaryTypes(d).filter((t) => v.counts[t.id]).map((t) => chip(t.id, t.label)).join('')}</div>
    <label class="xsearch">${I.search}<span class="sr">Search this diary</span><input id="xd-q" placeholder="${esc(d.searchHint || 'Search: a show, town or craft')}" value="${esc(X.diaryQ)}" autocomplete="off"></label></div>
    <p class="note" style="margin:0;display:flex;flex-wrap:wrap;gap:8px;align-items:center">Dates come from: ${key}</p>
    <div id="xd-list">${diaryList(sector)}</div>
    <p class="note" style="margin:0">${esc(C.diaryChecked(d.checked))}. Dates change, so confirm on the show’s own site before booking.</p></section>`;
}
function diaryList(sector) {
  const d = diaryData(sector);
  if (!d) return '';
  const v = C.diaryView(d, { type: X.diaryType }, today(), X.shows);
  const words = C.plainText(X.diaryQ || '').split(' ').filter(Boolean);
  const types = C.diaryTypes(d);
  const match = (e) => { const type = types.find((t) => t.id === e.type); const q = C.plainText([e.name, e.edition, e.venue, e.region, e.who, type && type.one, e.start ? C.fmtDates(e.start, e.end) : e.when].filter(Boolean).join(' ')); return words.every((w) => q.indexOf(w) >= 0); };
  let n = 0;
  const groups = v.groups.map((g) => { const items = g.items.filter(match); n += items.length; return items.length ? `<tr class="grp"><td colspan="5">${esc(g.label)}</td></tr>${items.map((e) => diaryRow(e, types)).join('')}` : ''; }).join('');
  if (!n) return `<p class="sub" style="margin:0">No shows match. Clear the search or choose All.</p>`;
  return `<div class="tbox"><table class="xt"><thead><tr><th scope="col">Dates</th><th scope="col">Show</th><th scope="col">Attendance</th><th scope="col">Dates from</th><th scope="col"><span class="sr">Links</span></th></tr></thead><tbody>${groups}</tbody></table></div>`;
}
function diaryRow(e, types) {
  const type = types.find((t) => t.id === e.type), mark = C.DIARY_DATES[e.dates] ? e.dates : 'tbc', name = C.diaryName(e);
  const h = C.attHeadline(e.attendance);
  const att = h ? `<button class="linkish" type="button" data-xa="attendance" data-i="${e.i}">${esc(h.mark === 'none' ? (h.text === 'Not published' ? 'Not published' : 'No recent figures') : (h.mark === 'estimate' ? 'About ' : '') + h.text + (h.year && h.mark !== 'estimate' ? ' in ' + h.year : ''))}</button>${h.next ? `<small>${esc(h.next)}</small>` : ''}` : '<span class="muted">–</span>';
  const links = [];
  if (!e.series && e.venue) links.push(`<a class="icon-btn" href="${esc(C.mapsUrl(e.venue))}" target="_blank" rel="noopener" aria-label="${esc(e.venue)} in Google Maps" title="Venue in Google Maps">${I.pin}</a>`);
  if (e.site) links.push(`<a class="icon-btn" href="${esc(e.site)}" target="_blank" rel="noopener" aria-label="${esc(name)} website" title="Website">${I.globe}</a>`);
  if (e.list) links.push(`<a class="icon-btn" href="${esc(e.list)}" target="_blank" rel="noopener" aria-label="${esc(name)} ${esc(e.listLabel || 'exhibitor list')}" title="${esc(e.listLabel || 'Exhibitor list')}">${I.list}</a>`);
  if (e.added) links.push(`<a class="btn small" href="${esc(hashFor.show(e.added.id))}">${I.tick}Yours</a>`);
  else if (!e.series) links.push(`<button class="btn small yellow" type="button" data-xa="diary-add" data-i="${e.i}">${I.plus}Add</button>`);
  const src = e.source ? `<a class="ftag ${DIARY_MARK[mark]}" href="${esc(e.source)}" target="_blank" rel="noopener" title="${esc(C.DIARY_DATES[mark].help)}. Source: ${esc(e.sourceName || '')}">${esc(C.DIARY_DATES[mark].label.toUpperCase())}</a>` : `<span class="ftag ${DIARY_MARK[mark]}">${esc(C.DIARY_DATES[mark].label.toUpperCase())}</span>`;
  return `<tr><td style="white-space:nowrap">${e.phase === 'live' ? '<b style="color:var(--yellow)">On now</b><br>' : ''}${esc(e.start ? C.fmtDates(e.start, e.end) : e.when || 'Dates not out yet')}</td>
    <td><div class="nm"><b>${esc(e.name)}${e.edition ? ` <span class="muted" style="font-weight:500">· ${esc(e.edition)}</span>` : ''}</b><span>${esc([type && type.one, e.venue].filter(Boolean).join(' · '))}</span>${e.who ? `<span>${esc(e.who)}</span>` : ''}${e.note ? `<span>${esc(e.note)}</span>` : ''}</div></td>
    <td><div class="nm">${att}</div></td><td>${src}</td><td class="r"><div class="row-acts" style="justify-content:flex-end;flex-wrap:nowrap">${links.join('')}</div></td></tr>`;
}
function diaryEntry(i) { const d = diaryData(X.route.sector); return d ? d.shows[+i] || null : null; }
function openAttendance(entry) {
  const a = entry && entry.attendance;
  if (!a) return;
  const figs = C.attFigures(a), est = a.estimate, mark = (k) => `<span class="ftag ${k === 'counted' ? 'mint' : k === 'estimate' ? 'sky' : k === 'claim' ? 'yellow' : 'muted'}" title="${esc((C.ATT_MARKS[k] || {}).help || '')}">${esc(((C.ATT_MARKS[k] || {}).label || '').toUpperCase())}</span>`;
  openDialog(`${dhead('Attendance', [entry.name, entry.edition].filter(Boolean).join(' · '))}
    ${est && est.low ? `<div class="d-sec" style="border-top:0;padding-top:0"><span class="eyebrow">Next show</span><p style="margin:0"><b>${esc(C.attRangeText(est))}</b> ${mark('estimate')}</p><p class="sub" style="margin:0">${esc(est.how || '')}</p></div>` : ''}
    <div class="d-sec"><span class="eyebrow">Published figures</span>${figs.length ? figs.map((f) => `<div class="nm" style="gap:4px"><p style="margin:0">${mark(f.mark)} <span class="mono">${esc(String(f.year || ''))}</span> <b>${esc(f.shown || 'in words only')}</b></p>${f.text ? `<span class="sub">“${esc(f.text)}”</span>` : ''}${f.source ? `<a href="${esc(f.source)}" target="_blank" rel="noopener">${esc(f.sourceName || 'Source')}</a>` : ''}</div>`).join('') : `<p class="sub" style="margin:0">${mark('none')} Nothing published.</p>`}</div>
    ${a.note ? `<p class="sub" style="margin:0">${esc(a.note)}</p>` : ''}
    <p class="note" style="margin:0">Guidance, not fact. Organisers count in different ways: some count visits rather than people, some include exhibitors, and few are audited.${a.checked ? ` Checked ${esc(C.fmtDates(a.checked))}.` : ''}</p>`);
}

/* ---------- A show ---------- */
function pageShow(id) {
  const s = showById(id);
  if (!s) return pageHead({ crumbs: [['Exhibitors', hashFor.home()]], title: 'Exhibition not found' }) + gatePanel('Exhibition not found', 'It may have been deleted. Go back and choose another.');
  const lc = lineOf(s.sector), group = C.GROUPS.find((g) => g.id === C.showGroup(s, today()));
  const wh = group.id === 'undated' ? 'Dates not set' : `<span class="hl">${esc(C.fmtDates(s.start, s.end))}</span>, ${esc(whenWords(s))}`;
  return pageHead({ crumbs: [['Exhibitors', hashFor.home()], [s.sector || 'General', hashFor.sector(s.sector || 'General')], [s.name]], title: s.name, lc,
    lede: wh + (s.venue ? ' · ' + esc(s.venue) : ''), actions: showActs(s), actionsId: 'xs-acts' })
    + `<div class="show-top" id="xs-top" style="--lc:${lc}">${showTop(s)}</div>
    <div class="show-grid"><section class="panel" aria-labelledby="list-h">
      <div class="tools-row"><h2 class="h3" id="list-h">Exhibitors</h2><label class="xsearch" style="width:280px">${I.search}<span class="sr">Search this list</span><input id="xs-q" placeholder="Search this list" value="${esc(X.q)}" autocomplete="off"></label></div>
      <div id="xs-chips">${chipsHtml(s)}</div><div id="xs-rows">${rowsHtml(s)}</div></section>
      <aside class="panel detail${X.sel ? ' open' : ''}" id="xs-detail" aria-label="The exhibitor">${detailHtml()}</aside></div>`;
}
function showActs(s) {
  const p = pipeData(s.id), ready = !!(p && p.pipelineReady), rows = X.rows[s.id] || [];
  return `<a class="icon-sq" href="${esc(C.mapsUrl(s.venue || s.name))}" target="_blank" rel="noopener" aria-label="Open the venue in Google Maps" title="Venue in Google Maps">${I.pin}</a>`
    + (rows.length ? `<button class="icon-sq" type="button" data-xa="csv" aria-label="Download CSV" title="Download CSV">${I.down}</button>` : '')
    + `<button class="btn" type="button" data-xa="show-menu">Exhibition options</button>`
    + (ready && rows.length ? `<button class="btn yellow" type="button" data-xa="go" data-id="${esc(s.id)}">${p && p.counts && p.counts.imported ? 'Go again' : 'Go'}</button>` : '');
}
function whenWords(s) {
  const t = C.dayNum(today()), a = C.dayNum(s.start); let b = C.dayNum(s.end); if (isNaN(b) || b < a) b = a;
  if (a <= t && t <= b) return 'on now';
  if (a > t) return a - t === 1 ? 'starts tomorrow' : a - t < 14 ? `starts in ${a - t} days` : 'coming up';
  return t - b < 365 ? 'in the past 12 months' : 'some time ago';
}
function updateShowParts() {
  const s = showById(X.route.id);
  if (!s || !document.getElementById('xs-top')) return;
  setHtml('xs-acts', showActs(s));
  setHtml('xs-top', showTop(s));
  setHtml('xs-chips', chipsHtml(s));
  setHtml('xs-rows', rowsHtml(s));
  setHtml('xs-detail', detailHtml());
  const d = document.getElementById('xs-detail'); if (d) d.classList.toggle('open', !!X.sel);
  refreshNotices();
}
function showCounts(s) { const rows = X.rows[s.id]; return rows && rows.length ? C.countRows(rows) : (s.counts || C.countRows([])); }
function showTop(s) {
  const c = showCounts(s), running = E.running && E.showId === s.id && !E.stop;
  return leadPanel(s, c, running) + pipePanel(s, c) + orgPanel(s);
}
function leadPanel(s, c, running) {
  if (!c.total) {
    const bad = s.status === 'blocked' || s.status === 'empty' || s.status === 'error';
    const acts = s.urls.length && !bad ? `<button class="btn small yellow" type="button" data-xa="load" data-id="${esc(s.id)}">Load exhibitor list</button><button class="btn small" type="button" data-xa="paste" data-id="${esc(s.id)}">Paste a list</button>`
      : `<button class="btn small yellow" type="button" data-xa="paste" data-id="${esc(s.id)}">Paste the list</button>${!s.urls.length ? '<button class="btn small" type="button" data-xa="edit-show">Add a link</button>' : s.status === 'blocked' ? '<button class="btn small" type="button" data-xa="edit-show">Change the link</button>' : `<button class="btn small" type="button" data-xa="load" data-id="${esc(s.id)}">Try the link again</button>`}`;
    return `<section class="panel"><div class="panel-head"><div><span class="eyebrow">Exhibitors</span><h2 class="h3">No exhibitors yet</h2></div></div><p class="sub" style="margin:0">${esc(C.summary(c, s))}</p><div class="row-acts">${acts}</div></section>`;
  }
  const per = X.status && X.status.speed && X.status.speed.seconds;
  const other = Math.max(0, c.done - c.google - c.microsoft);
  return `<section class="panel" aria-labelledby="lead-h"><div class="panel-head"><div><span class="eyebrow${c.pending ? ' live' : ''}">${c.pending ? `<span class="pulse${running ? '' : ' off'}"></span>Exhibitors · checking` : 'Exhibitors · all checked'}</span><h2 class="h3" id="lead-h">${plural(c.total, 'exhibitor')}, ${commas(c.corporate)} you can email</h2></div>
    ${c.pending ? `<button class="run-btn${running ? '' : ' off'}" type="button" data-xa="${running ? 'pause' : 'resume'}" aria-label="${running ? 'Pause checking' : 'Keep checking'}">${running ? I.pause : I.play}</button>` : ''}</div>
    ${c.pending ? `<p class="sub" style="margin:0">${commas(c.done)} of ${commas(c.total)} checked · ${esc(C.waitingLine(c.pending, per, running))}</p>` : ''}
    <div class="stack8"><div class="lbar" role="img" aria-label="${esc(`Can email ${c.corporate}, to check ${c.check}, consent needed ${c.consent}${c.pending ? ', waiting ' + c.pending : ''}`)}">${bars([['ok-bg', c.corporate], ['check-bg', c.check], ['consent-bg', c.consent], ['pending-bg', c.pending]])}</div>
    <div class="keys"><span><i class="ok-bg"></i><b>${commas(c.corporate)}</b> can email</span><span><i class="check-bg"></i><b>${commas(c.check)}</b> to check</span><span><i class="consent-bg"></i><b>${commas(c.consent)}</b> consent needed</span></div></div>
    <div class="stack8"><div class="lbar thin" role="img" aria-label="${esc(`Google ${c.google}, Microsoft ${c.microsoft}, other ${other}`)}">${bars([['g-bg', c.google], ['m-bg', c.microsoft], ['o-bg', other]])}</div>
    <div class="keys"><span><i class="g-bg"></i><b>${commas(c.google)}</b> Google</span><span><i class="m-bg"></i><b>${commas(c.microsoft)}</b> Microsoft</span><span><i class="o-bg"></i><b>${commas(other)}</b> other</span></div></div></section>`;
}
function pipePanel(s, c) {
  const pp = X.pipe[s.id] || {}, d = pp.data;
  const top = '<div class="panel-head"><div><span class="eyebrow">In the pipeline</span>';
  if (!d) return `<section class="panel">${top}<h2 class="h3">${pp.err ? 'Couldn’t read the pipeline' : 'Reading the pipeline…'}</h2></div></div>${pp.err ? `<p class="sub" style="margin:0">${esc(pp.err)}</p><button class="btn small" type="button" data-xa="pipe-retry" style="align-self:flex-start">Try again</button>` : ''}</section>`;
  const k = d.counts || {}, pc = pipeCounts(s.id, X.rows[s.id] || []) || {}, facts = [];
  if (k.check) facts.push(`<li class="you"><b>${commas(k.check)}</b> waiting for your Companies House call</li>`);
  if (k.imported && pc['pipe-out']) facts.push(`<li><b>${commas(pc['pipe-out'])}</b> checked here, not in the pipeline (other sectors, opt-outs, duplicates)</li>`);
  if (c.pending) facts.push(`<li><b>${commas(c.pending)}</b> still being checked here: Go leaves them for next time</li>`);
  if (d.show) facts.push(`<li>${d.show.attending ? `You’re going${d.show.visitDay && d.show.visitDay !== 'all' ? ': ' + esc(d.show.visitDay) : ''}` : 'Not going'}${d.show.page ? ` · emails link to /showsum/${esc(d.show.page)}/` : ''}</li>`);
  if (d.firstReady) facts.push(`<li><b>${commas(d.firstReady)}</b> due a first email, not in a batch${d.fastReady ? ` (${commas(d.fastReady)} of them P1 or P2)` : ''}</li>`);
  const deps = (d.batches || []).map((b) => `<a class="dep-chip${b.status === 'Started' ? '' : ' idle'}" href="#/overview"><div><b>${esc(b.id)} · ${esc(STEP_WORDS[b.stage] || b.stage || '')}</b><span>${esc(plural(b.members, 'member'))}${b.dueNow ? ` · ${commas(b.dueNow)} due now` : ''}</span></div><span class="chip ${b.status === 'Started' ? 'live' : b.status === 'Paused' ? 'warn' : 'dim'}">${esc(b.status === 'Ready' ? 'Not started' : b.status)}</span></a>`).join('');
  const acts = [];
  if (pc['pipe-check']) acts.push(`<button class="btn small yellow" type="button" data-xfilter="pipe-check">Show the ${pc['pipe-check']} to decide</button>`);
  if (d.pipelineReady && c.total) acts.push(`<button class="btn small" type="button" data-xa="go" data-id="${esc(s.id)}">${k.imported ? 'Go again' : 'Go'}</button>`);
  acts.push('<a class="btn small" href="#/overview">Departures</a>');
  return `<section class="panel" aria-labelledby="pipe-h">${top}<h2 class="h3" id="pipe-h">${k.imported ? `${commas(k.imported)} in · ${commas(k.emailed)} emailed · ${commas(k.canEmail)} can email` : 'Not in the pipeline yet'}</h2></div></div>
    ${k.imported ? '' : '<p class="sub" style="margin:0">Go brings in the exhibitors checked here, with the pipeline’s own rules.</p>'}
    ${facts.length ? `<ul class="pipe-facts">${facts.join('')}</ul>` : ''}${deps}
    ${!d.pipelineReady ? '<p class="note" style="margin:0">To use Go, add PIPELINE_URL and SHEET_SECRET to HQ’s Script Properties.</p>' : ''}
    ${pp.err ? `<p class="note" style="margin:0">Couldn’t look again just now: ${esc(pp.err)}</p>` : ''}
    <div class="row-acts">${acts.join('')}</div></section>`;
}
function orgPanel(s) {
  const has = s.organiser || s.contactEmail || s.contactPhone || s.contactName;
  const who = [s.contactName, s.contactRole].filter(Boolean).join(' · ');
  const entry = s.sector ? C.diaryEntryFor(s, diaryData(s.sector)) : null, h = entry ? C.attHeadline(entry.attendance) : null;
  const att = h ? `<button class="linkish" type="button" data-xa="attendance" data-i="show">${I.people} ${esc(h.mark === 'none' ? 'Attendance: not published' : (h.mark === 'estimate' ? 'About ' : '') + h.text + (h.year && h.mark !== 'estimate' ? ' in ' + h.year : ''))}${h.next ? ` · ${esc(h.next)}` : ''}</button>` : '';
  return `<section class="panel" aria-labelledby="org-h"><div class="panel-head"><div><span class="eyebrow">Organiser</span><h2 class="h3" id="org-h">${has && s.organiser ? esc(s.organiser) : 'Who sells the stands'}</h2></div></div>
    ${has ? `<div class="org">${who ? `<span>${esc(who)}</span>` : ''}${s.contactEmail ? `<a href="mailto:${esc(s.contactEmail)}">${I.mail}${esc(s.contactEmail)}</a>` : ''}${s.contactPhone ? `<a href="tel:${esc(String(s.contactPhone).replace(/\s+/g, ''))}">${I.phone}${esc(s.contactPhone)}</a>` : ''}${s.contactPage ? `<a class="src" href="${esc(s.contactPage)}" target="_blank" rel="noopener">From its site ${I.out}</a>` : ''}</div>`
      : `<p class="sub" style="margin:0">No organiser contact yet. HQ can read the show’s own Exhibit and Contact pages for who sells the stands, never a listings site.</p>`}
    ${s.urls.length ? `<div class="row-acts"><button class="btn small" type="button" data-xa="find-organiser">${s.contactAt ? 'Look again' : 'Find the organiser contact'}</button>${has ? '<button class="btn small ghost" type="button" data-xa="clear-organiser">Remove</button>' : ''}</div>` : ''}
    ${att}</section>`;
}
function pipeIs(r, f) {
  const pr = pipeRow(r);
  if (f === 'pipe-in') return !!pr;
  if (f === 'pipe-check') return needsCall(pr);
  if (f === 'pipe-out') return !pr && !!pipeData(r.showId) && C.statusOf(r) !== 'pending';
  return true;
}
function pipeCounts(id, rows) {
  if (!pipeData(id)) return null;
  const n = { 'pipe-in': 0, 'pipe-check': 0, 'pipe-out': 0 };
  rows.forEach((r) => { PIPE_FILTERS.forEach((x) => { if (pipeIs(r, x.id)) n[x.id]++; }); });
  return n;
}
function chipsHtml(s) {
  const rows = X.rows[s.id] || [], c = showCounts(s), pc = pipeCounts(s.id, rows);
  if (!c.total) return '';
  const dot = { corporate: 'ok', check: 'check', consent: 'consent' };
  const base = C.FILTERS.filter((x) => x.id === 'all' || x.id === X.filter || C.filterCount(c, x.id) > 0)
    .map((x) => `<button class="fchip" type="button" data-xfilter="${x.id}" aria-pressed="${X.filter === x.id}">${dot[x.id] ? `<span class="sd ${dot[x.id]}"></span>` : ''}${esc(x.label)} <span class="n">${commas(C.filterCount(c, x.id))}</span></button>`).join('');
  const pipe = PIPE_FILTERS.filter((x) => x.id === X.filter || (pc && pc[x.id] > 0))
    .map((x) => `<button class="fchip pipe${x.id === 'pipe-check' ? ' you' : ''}" type="button" data-xfilter="${x.id}" aria-pressed="${X.filter === x.id}">${esc(x.label)} <span class="n">${pc ? commas(pc[x.id]) : '…'}</span></button>`).join('');
  return `<div class="fchips" role="group" aria-label="Filter exhibitors">${base}${pipe ? '<span class="fsep" aria-hidden="true"></span>' + pipe : ''}</div>`;
}
function companyBrief(r) {
  const st = C.statusOf(r);
  if (st === 'pending') return 'Not checked yet';
  if (r.legal === 'verified') return r.legalSrc === 'Confirmed by you' ? 'Confirmed by you' : 'Confirmed';
  if (r.legal === 'likely') return 'Likely the same';
  if (r.legal === 'possible') return 'Possibly the same';
  if (r.legalSrc === 'Confirmed by you') return 'No company (you said)';
  if (C.isUnread(r)) return 'Couldn’t read its site';
  return r.companyNo ? (r.companyName || 'Found') : 'No company found';
}
function pipeTags(r) {
  const pr = pipeRow(r);
  if (!pr) return pipeData(r.showId) && C.statusOf(r) !== 'pending' ? '<span class="ftag muted">NOT IN THE PIPELINE</span>' : '';
  const what = pr.touches ? (pr.touches === 1 ? 'EMAILED' : `EMAILED ×${pr.touches}`) : needsCall(pr) ? 'YOUR CALL' : String(pr.stage || '').toUpperCase();
  const k = needsCall(pr) ? 'yellow' : pr.touches ? 'mint' : /^Yes/.test(pr.can) ? 'sky' : /Consent|^No/.test(pr.can) ? 'coral' : 'muted';
  return `<span class="ftag ${k}">${esc([pr.priority, what].filter(Boolean).join(' · '))}</span>${pr.batch ? `<span class="ftag">${esc(pr.batch)}</span>` : ''}`;
}
const STATUS_DOT = { corporate: 'ok', check: 'check', consent: 'consent', pending: 'pending' };
function rowsHtml(s) {
  const rows = X.rows[s.id] || [], c = showCounts(s);
  if (!c.total) return '';
  if (!rows.length) return '<p class="sub" style="margin:0"><span class="spinner"></span> Reading the exhibitors…</p>';
  const pipeF = /^pipe-/.test(X.filter);
  let list = C.filterRows(rows, { filter: pipeF ? 'all' : X.filter, q: X.q });
  if (pipeF) list = list.filter((r) => pipeIs(r, X.filter));
  const shown = list.slice(0, X.limit);
  if (!shown.length) return pipeF && !pipeData(s.id) ? '<p class="sub" style="margin:0"><span class="spinner"></span> Reading the pipeline…</p>' : '<p class="sub" style="margin:0">No exhibitors match. Clear the search or choose All.</p>';
  return `<div class="tbox"><table class="xt xrows"><thead><tr><th scope="col">Exhibitor</th><th scope="col">Stand</th><th scope="col">Can email</th><th scope="col">Email</th><th scope="col">Company</th><th scope="col">Pipeline</th></tr></thead><tbody>
    ${shown.map((r) => { const st = C.statusOf(r), n = C.listedCount(r); return `<tr data-xrow="${esc(r.id)}" tabindex="0"${X.sel === r.id ? ' class="sel" aria-selected="true"' : ''}>
      <td><div class="nm"><b>${esc(r.name)}</b><span>${esc([r.category, n >= 2 ? `in ${n} exhibitions` : '', !r.category ? r.domain : ''].filter(Boolean).join(' · '))}</span></div></td>
      <td class="mono muted">${esc(r.stand || '')}</td>
      <td><span class="st-txt"><span class="sd ${STATUS_DOT[st]}"></span>${esc(C.STATUS_LABEL[st])}</span></td>
      <td class="muted">${esc(C.workspaceShort(r) || '–')}</td>
      <td class="muted">${esc(companyBrief(r))}</td>
      <td><div class="tags">${pipeTags(r)}</div></td></tr>`; }).join('')}</tbody></table></div>
    ${list.length > shown.length ? `<button class="btn small" type="button" data-xa="more" style="align-self:center">Show ${Math.min(200, list.length - shown.length)} more of ${commas(list.length - shown.length)}</button>` : ''}`;
}

/* ---------- The exhibitor (right of the list; full screen on a phone) ---------- */
function kv(label, value, sub) { return value ? `<dt>${esc(label)}</dt><dd>${value}${sub ? `<small>${esc(sub)}</small>` : ''}</dd>` : ''; }
function detailHtml() {
  const r = X.sel && rowById(X.sel);
  if (!r) return `<span class="eyebrow">Exhibitor</span><p class="sub" style="margin:0">Choose an exhibitor to see its contact, the company behind it, its email setup and where it stands in the pipeline.</p>`;
  const st = C.statusOf(r), done = st !== 'pending', listed = C.listedCount(r);
  const needsAnswer = done && (r.legal === 'likely' || r.legal === 'possible') && r.legalSrc !== 'Confirmed by you';
  const link = (href, text, ext) => `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${esc(text)}</a>`;
  const copy = (text, what) => `<button class="copy-btn" type="button" data-xa="copy" data-text="${esc(text)}" data-what="${esc(what)}" aria-label="Copy ${esc(what)}">${I.copy}</button>`;
  const SURE = { verified: 'Confirmed', likely: 'Likely the same company', possible: 'Possibly the same company' };
  const coUrl = C.companyUrl(r.companyNo);
  const others = (r.alsoIn || []).map(showById).filter(Boolean);
  const stChip = { corporate: ['var(--mint)', 'rgba(126,224,161,.12)'], check: ['var(--amber)', 'rgba(252,195,93,.12)'], consent: ['var(--coral)', 'rgba(255,122,102,.12)'], pending: ['var(--muted)', 'var(--tile)'] }[st];
  return `<div class="d-head"><div><span class="eyebrow">${esc([r.stand ? 'Stand ' + r.stand : '', r.category].filter(Boolean).join(' · ') || 'Exhibitor')}</span>
      <h2 class="h2" id="xd-h">${esc(r.name)}</h2>
      <div class="d-tags"><span class="chip" style="color:${stChip[0]};background:${stChip[1]}">${esc(C.STATUS_LABEL[st])}</span>${done ? `<span class="chip">${esc(C.workspaceShort(r))}</span>` : ''}${listed >= 2 ? `<span class="chip dim">In ${listed} exhibitions</span>` : ''}</div></div>
      <button class="icon-btn" type="button" data-xa="close-row" aria-label="Close">${I.x}</button></div>
    <p class="sub" style="margin:0;font-size:13px">${esc(C.emailRule(r))}</p>
    ${needsAnswer ? `<div class="ask"><p>Companies House has a ${r.legal === 'likely' ? 'likely' : 'possible'} match: <b>${esc(r.companyName || '')}</b>. Is it the same business?</p>
      <div class="row-acts"><button class="btn small light" type="button" data-xa="match-yes" data-id="${esc(r.id)}">Yes, same company</button><button class="btn small" type="button" data-xa="match-no" data-id="${esc(r.id)}">No, a different one</button></div></div>` : ''}
    ${yourCallHtml(r)}
    <div class="d-sec"><span class="eyebrow">Contact</span><dl class="kv">
      ${kv('Email', r.email ? `<span class="copy">${link('mailto:' + r.email, r.email)}${copy(r.email, 'Email')}</span>` : '', [C.emailKindLabel(r.emailKind), r.emailSrc ? 'from ' + r.emailSrc : ''].filter(Boolean).join(', '))}
      ${kv('Phone', r.phone ? link('tel:' + r.phone.replace(/\s+/g, ''), r.phone) : '', r.phone && r.phoneSrc ? 'From ' + r.phoneSrc : '')}
      ${kv('Contact', esc(r.contact), r.contact && r.contactSrc ? 'From ' + r.contactSrc : '')}
      ${kv('Website', r.website ? link(r.website, r.website.replace(/^https?:\/\//, ''), true) : '')}</dl>
      ${!r.email && !r.phone && !r.contact && !r.website ? '<p class="note" style="margin:0">Nothing found yet. Edit the details to add what you know.</p>' : ''}</div>
    <div class="d-sec"><span class="eyebrow">Company</span><dl class="kv">
      ${r.companyNo ? kv('Company', esc(r.companyName), [C.companyTypeLabel(r.companyType), r.companyStatus].filter(Boolean).join(', '))
        + kv('Number', `<span class="copy mono">${coUrl ? link(coUrl, r.companyNo, true) : esc(r.companyNo)}${copy(r.companyNo, 'Company number')}</span>`, r.companyAddr)
        + kv('How sure', esc(SURE[r.legal] || ''), r.legalSrc) + kv('Director', esc(r.chDirector), 'From Companies House')
        : kv('Company', 'No company found', r.legalSrc && r.legalSrc !== 'No company found' ? r.legalSrc : '')}</dl>
      <div class="row-acts"><button class="btn small" type="button" data-xa="find-co" data-id="${esc(r.id)}">Find on Companies House</button><button class="btn small" type="button" data-xa="company-no" data-id="${esc(r.id)}">Enter company number</button></div></div>
    <div class="d-sec"><span class="eyebrow">Email setup</span><dl class="kv">
      ${kv('Provider', esc(C.workspaceLabel(r)))}${done ? kv('Also uses', esc(r.alsoUses || 'Nothing found'), 'From its domain records. Not finding a service doesn’t mean they don’t use it.') : ''}
      ${others.length ? `<dt>Also in</dt><dd>${others.map((o) => `<a href="${esc(hashFor.show(o.id))}">${esc(o.name)}</a><small>${esc([o.start ? C.fmtDates(o.start, o.end) : '', o.sector].filter(Boolean).join(' · '))}</small>`).join('')}</dd>` : ''}
      ${kv('About', esc(r.blurb))}${kv('Notes', esc(r.note))}</dl></div>
    <div class="row-acts d-foot"><button class="btn small" type="button" data-xa="edit-row" data-id="${esc(r.id)}">Edit details</button><button class="btn small" type="button" data-xa="recheck" data-id="${esc(r.id)}">Check again</button>
      ${done ? `<button class="btn small" type="button" data-xa="explain" data-id="${esc(r.id)}">Why this result?</button>` : ''}<button class="btn small danger" type="button" data-xa="remove-row" data-id="${esc(r.id)}">Remove</button></div>`;
}
function yourCallHtml(r) {
  const d = pipeData(r.showId), pr = pipeRow(r);
  if (!d) return `<div class="d-sec"><span class="eyebrow">In the pipeline</span><p class="sub" style="margin:0">${(X.pipe[r.showId] || {}).err ? esc(X.pipe[r.showId].err) : 'Reading the pipeline…'}</p></div>`;
  if (!pr) return `<div class="d-sec"><span class="eyebrow">In the pipeline</span><p class="sub" style="margin:0">Not in the pipeline. ${C.statusOf(r) === 'pending' ? 'Once it’s checked here, Go brings it in.' : 'Go brings it in, if the pipeline’s rules allow.'}</p></div>`;
  const facts = `CODE ${esc(String(pr.code).toUpperCase())} · STAGE ${esc(String(pr.stage).toUpperCase())}${pr.touches ? ` · ${pr.touches} EMAIL${pr.touches > 1 ? 'S' : ''} SENT` : ''}${pr.batch ? ` · ${esc(pr.batch)}` : ''}`;
  if (needsCall(pr)) {
    return `<div class="yourcall"><span class="t-top"><span class="t-tag">IN THE PIPELINE · YOUR CALL</span></span><b class="t-title">Can email: Check${pr.priority ? ` (${esc(pr.priority)})` : ''}</b>
      <p class="t-sub">The pipeline won’t email them until you decide. ${(r.legal === 'likely' || r.legal === 'possible') ? 'Confirming the company above decides it for you; ' : ''}a sole trader or partnership needs consent first.</p>
      <div class="row-acts"><button class="btn small dark" type="button" data-xa="pipe-yes" data-id="${esc(r.id)}">Yes (Ltd): can email</button><button class="btn small" type="button" data-xa="pipe-consent" data-id="${esc(r.id)}">Consent needed</button></div>
      <span class="t-sub mono-sm">${facts}</span></div>`;
  }
  return `<div class="d-sec"><span class="eyebrow">In the pipeline</span><dl class="kv">${kv('Can email', esc(pr.can), pr.priority ? 'Priority ' + pr.priority : '')}${pr.why ? kv('Next', esc(pr.why), pr.due ? 'Due ' + C.fmtDates(pr.due) : '') : ''}</dl>
    <span class="note mono-sm">${facts}</span>${pr.can === 'Yes (Ltd)' ? `<button class="btn small" type="button" data-xa="pipe-down" data-id="${esc(r.id)}" style="align-self:flex-start">Not a limited company? Consent needed</button>` : ''}</div>`;
}

/* ---------- Your calls on "Check" rows, made in the pipeline ---------- */
async function setCanEmail(r, value, expect, quiet) {
  const pr = pipeRow(r);
  if (!pr || pr.can !== expect || (value === 'Yes (Ltd)' && pr.touches)) return false;
  const j = await hq('setCanEmail', { code: pr.code, value, expect });
  const ce = j.canEmail || {};
  pr.can = value; if (ce.priority) pr.priority = ce.priority;
  const d = pipeData(r.showId), bucket = (v) => (v === 'Yes (Ltd)' ? 'canEmail' : v === 'Check' ? 'check' : 'consent');
  if (d && d.counts) { d.counts[bucket(expect)] = Math.max(0, (d.counts[bucket(expect)] || 0) - 1); d.counts[bucket(value)] = (d.counts[bucket(value)] || 0) + 1; }
  const also = j.twins ? ` (and ${plural(j.twins, 'other row')} of the same business)` : '';
  if (!quiet) toast((value === 'Yes (Ltd)' ? `${r.name}: the pipeline can email them now (${ce.priority || pr.priority || 'Yes (Ltd)'})` : value === 'Check' ? `${r.name}: held as Check, so no emails until you decide` : `${r.name}: consent needed, so no cold emails`) + also, false, 6000);
  loadPipe(r.showId); loadPipeAll(true);
  return also || true;
}
async function followConfirm(row) {
  const r0 = row && rowById(row.id);
  if (!r0) return;
  await loadPipe(r0.showId);
  const r = rowById(row.id), pr = r && pipeRow(r);
  if (!pipeData(r0.showId)) { toast('Saved here, but the pipeline couldn’t be read, so its row wasn’t changed. Open the exhibitor again in a moment to make your call there.', true); return; }
  if (!pr) return;
  let value = '', said = '';
  if (r.emailable === 'corporate' && pr.can === 'Check' && !pr.touches) { value = 'Yes (Ltd)'; said = 'Company confirmed, and the pipeline can email them now'; }
  else if (r.emailable === 'consent' && (pr.can === 'Check' || pr.can === 'Yes (Ltd)')) { value = 'Consent needed'; said = 'Saved, and the pipeline won’t cold-email them now (Consent needed)'; }
  else if (r.emailable === 'check' && pr.can === 'Yes (Ltd)') { value = 'Check'; said = 'Saved, and the pipeline holds them as Check until you decide'; }
  if (!value) return;
  try { const done = await setCanEmail(r, value, pr.can, true); toast(said + (typeof done === 'string' ? done : ''), false, 6000); if (onShow(r.showId)) updateShowParts(); }
  catch (e) { toast('Saved here, but the pipeline wasn’t changed: ' + errText(e), true); }
}

/* ---------- Go ---------- */
function openGo(s) {
  const d = pipeData(s.id) || {}, sh = d.show, p = pipeSum(s.id);
  const going = sh ? 'keep' : 'no';
  openDialog(`${dhead(sh || (p && p.imported) ? 'Go again' : 'Go', 'Go · ' + (s.sector || ''))}
    <p class="sub" style="margin:0">Brings <b style="color:var(--text)">${esc(s.name)}</b>’s checked exhibitors into the pipeline with its own rules: Can email, priority, sectors, opt-outs and duplicates, as Import a show does. Nothing is emailed.</p>
    <form id="xgo" data-id="${esc(s.id)}" novalidate class="stack14">
      <div class="field"><label for="go-name">Show name in the pipeline</label><input class="input" id="go-name" name="name" maxlength="120" value="${esc(sh ? sh.name : s.name)}"><span class="hint">What the emails call it.</span></div>
      <div class="grid2"><div class="field"><label for="go-going">Are you going?</label><select class="input" id="go-going" name="going">${sh ? '<option value="keep" selected>Keep as it is</option>' : ''}<option value="no"${going === 'no' ? ' selected' : ''}>No</option><option value="yes">Yes, I’m going</option></select></div>
      <div class="field"><label for="go-days">Which days</label><input class="input" id="go-days" name="days" maxlength="60" placeholder="All, or for example Sat 7 Nov" value="${esc(sh && sh.visitDay ? sh.visitDay : '')}"></div></div>
      <div class="field"><label for="go-page">Landing page</label><input class="input mono" id="go-page" name="page" maxlength="40" autocapitalize="off" spellcheck="false" placeholder="The sector’s own, such as crafts" value="${esc(sh && sh.page ? sh.page : '')}"><span class="hint">The showsum page the emails link to. Leave it empty for the sector’s own.</span></div>
      <label class="check-line"><input type="checkbox" name="fast" checked><span><b>Make a fast-lane batch</b> of the P1 and P2 ones due a first email. It waits on the Departures board: check Members, then Start.</span></label>
      <div class="actions d-acts"><button class="btn" type="button" data-xa="close">Cancel</button><button class="btn yellow" type="submit">Go</button></div></form>`);
}
async function submitGo(f) {
  const id = f.dataset.id, s = showById(id);
  if (!s) return;
  const going = f.going.value === 'yes' ? true : f.going.value === 'no' ? false : undefined;
  const body = { showId: id, name: f.name.value.trim(), days: going === true ? f.days.value.trim() : '', page: f.page.value.trim(), fast: !!f.fast.checked };
  if (going !== undefined) body.going = going;
  await withBusy(f.querySelector('[type=submit]'), async () => {
    let j;
    try { j = await hq('goShow', body, 170000); } catch (e) { toast(errText(e), true, 8000); return; }
    openGoResult(s, j, body.fast);
    loadPipe(id); loadPipeAll(true);
  });
}
function openGoResult(s, j, asked) {
  const g = j.go || {}, fast = j.fast, t = g.tally || {};
  const li = (n, text) => (n ? `<li><b>${commas(n)}</b> ${esc(text)}</li>` : '');
  const fastLine = !asked ? '' : fast && fast.id ? `<div class="dep-chip idle"><div><b>Fast-lane batch ${esc(fast.id)}</b><span>${esc(plural(fast.size, 'business', 'businesses'))} · not started: check Members, then Start</span></div><span class="chip dim">Ready</span></div>`
    : fast && fast.error ? `<p class="note" style="margin:0">The fast-lane batch wasn’t made: ${esc(fast.error)}</p>` : '<p class="note" style="margin:0">No fast-lane batch: no P1 or P2 business is due a first email outside a batch.</p>';
  openDialog(`${dhead('Done: ' + (g.showName || s.name), 'Go')}
    <ul class="pipe-facts">
      <li><b>${commas(g.fresh || 0)}</b> new businesses in the pipeline</li>
      ${li(g.otherSector, 'already in the sheet from another sector, added as New')}${li(g.prev, 'contacted before in this sector, added as Previously contacted for you to check')}
      ${li(g.refreshed, 'already here and now Yes (Ltd), from the checks in Exhibitor Leads')}${li(g.held, 'already here and now not emailed, as you decided in Exhibitor Leads')}
      ${li(g.twins, 'more rows of those businesses, from other shows, held the same way')}${li(g.here, 'were already in this show')}${li(g.merged, 'extra listings for the same business, merged')}
      ${li(g.optedOut, 'kept out because their email opted out')}${li(g.waiting, 'still being checked in Exhibitor Leads: Go again once they’re done')}${li(g.moved, 'left as they were: Prospects moved while saving, so Go again')}
      <li>P1 <b>${commas(t.P1)}</b> · P2 <b>${commas(t.P2)}</b> · P3 <b>${commas(t.P3)}</b> · P4 <b>${commas(t.P4)}</b> · P5 <b>${commas(t.P5)}</b></li>
      <li>${g.going ? `Going${g.days && g.days !== 'all' ? ': ' + esc(g.days) : ''}` : 'Not going'}${g.page ? ` · links open /showsum/${esc(g.page)}/` : ''}</li></ul>
    ${fastLine}
    <div class="actions d-acts"><button class="btn" type="button" data-xa="close">Done</button><a class="btn yellow" href="#/overview" data-xa="close">Open the Departures board</a></div>`);
}

/* ---------- Dialogs ---------- */
let dlg = null;
function openDialog(inner, wide) {
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'xdlg';
    dlg.setAttribute('aria-labelledby', 'xdlg-h');
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) { closeDialog(); return; } onClick(e); });
    dlg.addEventListener('submit', onSubmit);
    dlg.addEventListener('input', onInput);
  }
  dlg.classList.toggle('wide', !!wide);
  dlg.innerHTML = `<div class="dialog">${inner}</div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}
function closeDialog() { if (dlg && dlg.open) dlg.close(); }
const dialogOpen = () => !!(dlg && dlg.open);
function dhead(title, eyebrow) {
  return `<div class="panel-head" style="align-items:flex-start;flex-wrap:nowrap"><div>${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}<h2 class="h2" id="xdlg-h">${esc(title)}</h2></div><button class="icon-btn" type="button" data-xa="close" aria-label="Close">${I.x}</button></div>`;
}
function openConfirm(title, body, act, label, id, danger) {
  openDialog(`${dhead(title)}<p class="sub" style="margin:0">${esc(body)}</p><div class="actions d-acts"><button class="btn" type="button" data-xa="close">Cancel</button><button class="btn ${danger ? 'danger' : 'yellow'}" type="button" data-xa="${esc(act)}" data-id="${esc(id || '')}">${esc(label)}</button></div>`);
}
async function withBusy(btn, fn) {
  const was = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.innerHTML = '<span class="spinner"></span>' + was; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = was; } }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back */ }
  try { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const byId = () => Object.fromEntries(X.shows.map((s) => [s.id, s]));

/* Add or edit an exhibition: by its website (read for the dates, venue and exhibitor list) or by pasting the list */
function showForm(s, pre) {
  const v = s || {}, p = pre || {};
  const sectors = C.sectorOptions(X.shows).map((o) => o.name);
  return `<form id="xshow" data-id="${esc(v.id || '')}"${p.year ? ` data-year="${esc(p.year)}"` : ''} data-mode="link" novalidate class="stack14">
    <div class="field"><label for="sf-name">Exhibition name</label><input class="input" id="sf-name" name="name" maxlength="120" value="${esc(v.name || p.name || '')}" placeholder="For example The Whisky Show"></div>
    <div class="field"><label for="sf-sector">Sector</label><input class="input" id="sf-sector" name="sector" list="sf-sectors" maxlength="40" value="${esc(v.sector || p.sector || (X.route.v === 'sector' ? X.route.sector : '') || '')}" placeholder="For example Whisky and spirits"><datalist id="sf-sectors">${sectors.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
    <div class="grid2"><div class="field"><label for="sf-start">Starts <span class="from" id="sf-dates-from" hidden>from its site</span></label><input class="input" id="sf-start" name="start" type="date" value="${esc(v.start || p.start || '')}"></div>
      <div class="field"><label for="sf-end">Ends</label><input class="input" id="sf-end" name="end" type="date" value="${esc(v.end || p.end || '')}"></div></div>
    <div class="field"><label for="sf-venue">Venue <span class="from" id="sf-venue-from" hidden>from its site</span></label><input class="input" id="sf-venue" name="venue" maxlength="120" value="${esc(v.venue || p.venue || '')}" placeholder="For example Olympia London"></div>
    ${v.id ? '' : `<div class="field"><span style="font-weight:600;font-size:13.5px">Exhibitors from</span><div class="segs" role="radiogroup" aria-label="Exhibitors from"><button class="seg on" type="button" role="radio" aria-checked="true" data-xa="sf-mode" data-mode="link">Its website</button><button class="seg" type="button" role="radio" aria-checked="false" data-xa="sf-mode" data-mode="list">A list</button></div></div>`}
    <div class="field" data-pane="link"><label for="sf-urls">${v.id ? 'Exhibitor list links' : 'The show’s website, or its exhibitor list'}</label><textarea class="input" id="sf-urls" name="urls" rows="2" autocapitalize="off" spellcheck="false" placeholder="Paste the address">${esc((v.urls || []).join('\n') || p.url || '')}</textarea>
      <span class="hint">${v.id ? 'One link per line if the list runs over several pages.' : 'HQ finds its exhibitor list, dates and venue. Have the list itself? Choose A list.'}</span>${v.id ? '' : '<div class="look" id="sf-look" role="status" hidden></div>'}</div>
    ${v.id ? '' : `<div class="field" data-pane="list" hidden><label for="sf-list">Exhibitors</label><textarea class="input" id="sf-list" name="list" rows="7" autocapitalize="off" spellcheck="false" placeholder="Acme Ltd, www.acme.co.uk&#10;Beta Crafts"></textarea><span class="hint">One per line. A website after the name helps. A spreadsheet copy with columns works too.</span></div><p class="note" id="sf-note" role="status" hidden></p>`}
    <div class="actions d-acts"><button class="btn" type="button" data-xa="close">Cancel</button><button class="btn yellow" type="submit">${v.id ? 'Save' : 'Add and load'}</button></div></form>`;
}
function openAddShow(pre) {
  if (pre && pre.url && C.isDirectory(pre.url)) { openAddSearch(X.route.v === 'sector' ? X.route.sector : '', { url: pre.url, label: pre.name, shared: true, host: (/^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(pre.url) || [])[1] }); return; }
  openDialog(dhead('Add exhibition') + showForm(null, pre));
  if (pre && pre.diary) [['#sf-dates-from', pre.start], ['#sf-venue-from', pre.venue]].forEach(([sel, has]) => { const m = $(sel, dlg); if (m && has) { m.textContent = 'from the diary'; m.hidden = false; } });
  if (!linkBoxToList() && pre && pre.url) lookUp(pre.url);
}
function setShowMode(mode, note) {
  const f = $('#xshow', dlg); if (!f) return;
  f.dataset.mode = mode;
  f.querySelectorAll('[data-xa=sf-mode]').forEach((b) => { b.classList.toggle('on', b.dataset.mode === mode); b.setAttribute('aria-checked', String(b.dataset.mode === mode)); });
  f.querySelectorAll('[data-pane]').forEach((x) => { x.hidden = x.dataset.pane !== mode; });
  f.querySelector('[type=submit]').textContent = mode === 'list' ? 'Add and check' : 'Add and load';
  const n = $('#sf-note', dlg); if (n) { n.textContent = note || ''; n.hidden = !note; }
}
function linkBoxToList() {
  const a = $('#sf-urls', dlg), b = $('#sf-list', dlg);
  if (!a || !b || C.linkBoxKind(a.value).kind !== 'list') return false;
  b.value = (b.value.trim() ? b.value.trim() + '\n' : '') + a.value.trim(); a.value = '';
  setShowMode('list', 'That looks like a list of exhibitors, so it will be added as one.');
  return true;
}
let lookSeq = 0;
async function lookUp(url) {
  const f = $('#xshow', dlg), box = $('#sf-look', dlg);
  if (!f || f.dataset.id || !box) return;
  const seq = ++lookSeq, still = () => seq === lookSeq && document.body.contains(box);
  f.dataset.contact = '';
  box.hidden = false; box.className = 'look';
  if (C.isDirectory(url)) {
    const host = (/^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(C.validUrl(url)) || [])[1] || 'that site';
    box.className = 'look warn';
    box.innerHTML = `That’s a page on ${esc(host)}, which HQ doesn’t read. From it, open the show’s own website and paste that. <button class="linkish" type="button" data-xa="save-listing" data-url="${esc(url)}">Keep it as a search page</button>`;
    return;
  }
  box.innerHTML = '<span class="spinner"></span> Looking at the show’s website…';
  let j;
  try { j = await el('lookShow', { url }); } catch (e) {
    if (!still()) return;
    if (/unknown action/i.test(e.message || '')) { box.hidden = true; return; }
    box.className = 'look warn'; box.textContent = 'Couldn’t read the website: ' + errText(e); return;
  }
  if (!still()) return;
  const set = (sel, val, mark) => { const x = $(sel, dlg); if (x && val && !x.value.trim()) { x.value = val; if (mark) $(mark, dlg).hidden = false; return true; } return false; };
  if (j.directory) { box.className = 'look warn'; box.innerHTML = `That’s a listings page on ${esc(j.host)}, which HQ doesn’t read. Open the show’s own website from it. <button class="linkish" type="button" data-xa="save-listing" data-url="${esc(url)}">Keep it as a search page</button>`; return; }
  if (j.blocked || j.error) { box.className = 'look warn'; box.textContent = (j.note || j.error) + '. Add the exhibitor list link yourself, or choose A list and paste it.'; return; }
  f.dataset.contact = j.contact ? JSON.stringify(j.contact) : '';
  const org = () => { if (j.contact) box.insertAdjacentHTML('beforeend', `<span class="look-org">${I.mail}<span>${esc(['Organiser contact' + (j.contact.organiser ? ': ' + j.contact.organiser : ''), [j.contact.name, j.contact.role].filter(Boolean).join(', '), j.contact.email, j.contact.phone].filter(Boolean).join(' · '))}</span></span>`); };
  set('#sf-name', j.name);
  const year = f.dataset.year;
  if (year && j.start && !C.fitsYear(j.start, year)) { box.className = 'look'; box.innerHTML = `Its website still shows ${esc(C.fmtDates(j.start, j.end))}. <small>Those aren’t the ${esc(year)} dates, so they’re left empty, and so is its current exhibitor list.</small>`; org(); return; }
  if (set('#sf-start', j.start, '#sf-dates-from')) set('#sf-end', j.end);
  set('#sf-venue', j.venue, '#sf-venue-from');
  const ub = $('#sf-urls', dlg);
  if (j.listUrl && !j.self && ub && C.validUrl(ub.value.trim()) === C.validUrl(url)) ub.value = j.listUrl;
  if (j.listUrl && j.count) { box.className = 'look ok'; box.innerHTML = j.self ? `<b>${I.tick} This is the exhibitor list</b> <small>About ${esc(j.count)} names on it</small>` : `<b>${I.tick} Found the exhibitor list</b> on the show’s website <small>${j.listText ? `“${esc(j.listText)}” · ` : ''}about ${esc(j.count)} names</small>`; }
  else if (j.listUrl) { box.className = 'look warn'; box.innerHTML = `Found its exhibitor page${j.listText ? ` (“${esc(j.listText)}”)` : ''}, but no names could be read from it yet. <small>Try Add and load anyway, or choose A list and paste the names.</small>`; }
  else { box.className = 'look'; box.innerHTML = 'No exhibitor list on its website yet. <small>Add the show now and load the list when it appears, often a few weeks before. Or paste it.</small>'; }
  org();
}
async function submitShow(f) {
  const fd = new FormData(f), id = f.dataset.id;
  const name = String(fd.get('name') || '').trim(), sector = C.matchSector(fd.get('sector'), X.shows);
  if (!name) { toast('Give the exhibition a name', true); return; }
  if (!sector) { toast('Add a sector, such as Whisky and spirits', true); return; }
  const listMode = !id && f.dataset.mode === 'list';
  let urls = [], list = '';
  if (listMode) { list = String(fd.get('list') || '').trim(); if (!list) { toast('Paste at least one exhibitor, or choose Its website', true); return; } }
  else {
    const k = C.linkBoxKind(fd.get('urls'));
    if (k.kind === 'list') { if (!id && linkBoxToList()) return; toast('That looks like a list of exhibitors. Add it with Paste a list in Exhibition options', true); return; }
    if (k.kind === 'bad') { toast(`“${k.bad.length > 40 ? k.bad.slice(0, 40) + '…' : k.bad}” isn’t a web address. Check it${id ? '' : ', or choose A list to paste the exhibitors'}`, true); return; }
    urls = k.urls;
  }
  await withBusy(f.querySelector('[type=submit]'), async () => {
    try {
      let contact; try { contact = !id && f.dataset.contact ? JSON.parse(f.dataset.contact) : undefined; } catch (e) { contact = undefined; }
      const j = await el('saveShow', { id: id || undefined, name, sector, start: fd.get('start') || '', end: fd.get('end') || '', urls: urls.join('\n'), venue: String(fd.get('venue') || '').trim(), contact });
      let pasted = null, pasteErr = null;
      if (list) { try { pasted = await el('pasteList', { showId: j.show.id, text: list }); } catch (err) { pasteErr = err; } }
      closeDialog();
      await loadShows(true, true);
      const show = showById(j.show.id) || j.show;
      if (!id) {
        if (pasted) toast(`${plural(pasted.added, 'exhibitor')} added${pasted.skipped ? `, ${pasted.skipped} already there` : ''}`);
        else if (pasteErr) toast(`The exhibition was added, but not the list: ${errText(pasteErr)}. Use Paste a list to try again`, true, 8000);
        go(hashFor.show(show.id));
        if (!pasted && !pasteErr && show.urls && show.urls.length) { await sleep(80); loadList(show, null); }
        else if (!pasted && !pasteErr) toast('Added. Paste the list to get started');
      } else { toast('Saved'); refresh(); }
    } catch (e) { toast(errText(e), true); }
  });
}
async function loadList(s, btn) {
  await withBusy(btn, async () => {
    toast('Reading the exhibitor list…', false, 4000);
    try {
      const r = await el('loadShow', { id: s.id }, 90000);
      await loadShows(true, true);
      if (r.status === 'loaded') { toast(`${plural(r.added, 'exhibitor')} added${r.skipped ? `, ${r.skipped} already there` : ''}`); await fetchRows(s.id).catch(() => {}); }
      else toast(r.note || 'No exhibitors found', true);
      E.userPaused = false;
      if (onShow(s.id)) updateShowParts(); else refresh();
      ensureChecking();
    } catch (e) { toast(errText(e), true); }
  });
}
function openPaste(s) {
  openDialog(`${dhead('Paste the list', s.name)}<p class="sub" style="margin:0">Exhibitor names, one per line. A website after the name helps: Acme Ltd, www.acme.co.uk. A spreadsheet copy with columns works too.</p>
    <form id="xpaste" data-id="${esc(s.id)}" class="stack14"><div class="field"><label for="xp-text">Exhibitors</label><textarea class="input" id="xp-text" name="text" rows="10" autocapitalize="off" spellcheck="false" placeholder="Acme Ltd, www.acme.co.uk&#10;Beta Crafts&#10;Gamma Foods, gamma.com"></textarea></div>
    <div class="actions d-acts"><button class="btn" type="button" data-xa="close">Cancel</button><button class="btn yellow" type="submit">Add to this exhibition</button></div></form>`);
}
function openShowMenu(s) {
  const c = C.countRows(X.rows[s.id] || []), filtered = X.filter !== 'all' || X.q;
  const item = (act, title, sub) => `<button class="menu-item" type="button" data-xa="${act}"><b>${esc(title)}</b><span>${esc(sub)}</span></button>`;
  openDialog(`${dhead('Exhibition options', s.name)}<div class="menu-list">
    ${item('edit-show', 'Edit details', 'Name, dates, sector, venue and links')}${item('paste', 'Paste a list', 'Add exhibitors by hand')}
    ${s.urls.length ? item('load', 'Load the list again', 'New exhibitors are added, existing ones kept') : ''}
    ${s.urls.length ? item('find-organiser', s.contactAt ? 'Look for the organiser contact again' : 'Find the organiser contact', 'Reads the show’s own Exhibit and Contact pages') : ''}
    ${s.organiser || s.contactEmail || s.contactPhone || s.contactName ? item('clear-organiser', 'Remove the organiser contact', 'If it’s wrong or out of date') : ''}
    ${c.likely ? item('confirm-likely', `Confirm ${plural(c.likely, 'likely match', 'likely matches')}`, 'Same name on Companies House, active. Treats them as confirmed') : ''}
    ${c.check ? item('recheck-weak', `Check the ${c.check} “to check” again`, 'With the newer company rules. Ones you confirmed are kept') : ''}
    ${c.total ? item('recheck-all', 'Check everything again', 'Websites, email and companies, from the start') : ''}
    ${filtered && c.total ? item('csv-shown', 'Download only what is shown', 'Uses the current filter and search') : ''}
    ${X.status && X.status.sheetUrl ? `<a class="menu-item" href="${esc(X.status.sheetUrl)}" target="_blank" rel="noopener"><b>Open the Exhibitor Leads sheet</b><span>Where all of this is kept</span></a>` : ''}
    <button class="menu-item danger" type="button" data-xa="delete-show"><b>Delete exhibition</b><span>Removes it and its exhibitors from the Exhibitor Leads sheet</span></button></div>`);
}
function openEditRow(r) {
  const f = (name, label, val, attrs) => `<div class="field"><label for="er-${name}">${label}</label><input class="input" id="er-${name}" name="${name}" value="${esc(val || '')}" ${attrs || ''} autocomplete="off"></div>`;
  openDialog(`${dhead('Edit details', r.name)}<form id="xedit" data-id="${esc(r.id)}" novalidate class="stack14">
    ${f('contact', 'Contact name', r.contact)}${f('email', 'Email', r.email, 'type="email" inputmode="email"')}${f('phone', 'Phone', r.phone, 'type="tel" inputmode="tel"')}${f('website', 'Website', r.website, 'type="url" inputmode="url"')}
    <div class="field"><label for="er-note">Notes</label><textarea class="input" id="er-note" name="note" rows="3">${esc(r.note || '')}</textarea><span class="hint">Changing the website or email starts the checks again for this business.</span></div>
    <div class="actions d-acts"><button class="btn" type="button" data-xa="close">Cancel</button><button class="btn yellow" type="submit">Save</button></div></form>`);
}
const nice = (t) => { t = String(t || '').replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
function pickListHtml() {
  const p = X.pick || {};
  if (p.err) return `<p class="sub" style="margin:0">${esc(p.err)}</p>`;
  if (!p.items) return '';
  if (!p.items.length) return '<p class="sub" style="margin:0">Nothing found. Try fewer words, or the company number.</p>';
  return `<div class="menu-list">${p.items.map((c, i) => `<button class="menu-item${c.status && c.status !== 'active' ? ' off' : ''}" type="button" data-xa="pick-co" data-i="${i}"><b>${esc(c.name)}</b><span>${esc([nice(c.status), c.no, C.companyTypeLabel(c.type)].filter(Boolean).join(' · '))}</span>${c.addr ? `<span>${esc(c.addr)}</span>` : ''}</button>`).join('')}</div>`;
}
function openPicker(id, keep) {
  const r = rowById(id) || {}, q = keep ? keep.q : (r.companyName || r.name || '');
  X.pick = { id, q, items: keep ? keep.items : null, err: '' };
  openDialog(`${dhead('Find on Companies House', r.name || '')}<p class="sub" style="margin:0">Type the company name, or paste its number, then choose the right one.</p>
    <form id="xpick" data-id="${esc(id)}" class="row-acts" style="flex-wrap:nowrap"><input class="input" name="q" value="${esc(q)}" placeholder="Company name or number" autocomplete="off" maxlength="120" aria-label="Company name or number" style="flex:1"><button class="btn yellow" type="submit">Search</button></form>
    <div id="xpick-list" aria-live="polite">${pickListHtml()}</div>`, true);
}
function openPickConfirm(i) {
  const p = X.pick || {}, c = (p.items || [])[i], r = rowById(p.id) || {};
  if (!c) return;
  const live = !c.status || c.status === 'active';
  openDialog(`${dhead('Use this company?', r.name || '')}<p class="sub" style="margin:0">${esc(r.name || 'This business')} will be set to the company below and marked as confirmed by you.</p>
    <dl class="kv">${kv('Company', esc(c.name), [C.companyTypeLabel(c.type), nice(c.status)].filter(Boolean).join(', '))}${kv('Number', esc(c.no), c.addr)}</dl>
    ${live ? '' : '<p class="note" style="margin:0">This company isn’t active on the register, so the lead stays “to check” rather than “can email”.</p>'}
    <div class="actions d-acts"><button class="btn" type="button" data-xa="pick-back">Back to the results</button><button class="btn yellow" type="button" data-xa="pick-yes" data-i="${i}">Yes, use this company</button></div>`);
}
function openCompanyNo(id) {
  openDialog(`${dhead('Company number', (rowById(id) || {}).name || '')}<p class="sub" style="margin:0">Look the company up on Companies House and type its number here. It’s checked against the register.</p>
    <form id="xcono" data-id="${esc(id)}" class="stack14"><div class="field"><label for="co-no">Company number</label><input class="input mono" id="co-no" name="number" placeholder="For example 01234567 or SC123456" autocapitalize="characters" autocomplete="off" maxlength="12"></div>
    <div class="actions d-acts"><button class="btn" type="button" data-xa="close">Cancel</button><button class="btn yellow" type="submit">Check and save</button></div></form>`);
}
function openExplain(id, j) {
  const r = rowById(id) || {}, x = C.explainText(r, j);
  X.whyText = x.text;
  openDialog(`${dhead('Why this result?', r.name || '')}<p class="note" style="margin:0">This ran the check again without saving anything.</p>
    <div class="why-cmp"><span>Saved: <b>${esc(x.saved)}</b></span><span>A fresh check now: <b>${esc(x.now)}</b></span></div>
    ${x.changed ? '<p class="note" style="margin:0">The fresh check differs from what’s saved. Use Check again to keep it.</p>' : ''}
    <pre class="why">${esc(x.lines.join('\n') || 'Nothing was read.')}</pre>
    <div class="actions d-acts"><button class="btn" type="button" data-xa="close">Close</button><button class="btn yellow" type="button" data-xa="copy-why">Copy</button></div>`, true);
}
function openRename(sector) {
  const n = X.shows.filter((x) => x.sector === sector).length;
  openDialog(`${dhead('Rename sector', sector)}<form id="xrename" data-sector="${esc(sector)}" novalidate class="stack14"><div class="field"><label for="rn-name">Sector name</label><input class="input" id="rn-name" name="name" list="rn-list" value="${esc(sector)}" maxlength="40" autocomplete="off">
    <datalist id="rn-list">${C.sectorOptions(X.shows).map((o) => `<option value="${esc(o.name)}">`).join('')}</datalist><span class="hint">This changes ${plural(n, 'exhibition')}. Choose a name that already exists to join the two sectors.</span></div>
    <div class="actions d-acts"><button class="btn" type="button" data-xa="close">Cancel</button><button class="btn yellow" type="submit">Rename</button></div></form>`);
}
function openAddSearch(sector, pre) {
  pre = pre || {};
  openDialog(`${dhead(pre.shared ? 'A listings page' : 'Save a search page')}<p class="sub" style="margin:0">${pre.shared ? `${esc(pre.host || 'This')} is a listings site, so HQ doesn’t read it. From it, open the show’s own website and add that. Or keep this page here to browse again.` : 'Set the filters you like on a listings site, copy the page address and paste it here. It appears under Find exhibitions.'}</p>
    <form id="xsearchpage" novalidate class="stack14"><div class="field"><label for="ss-url">Page address</label><input class="input" id="ss-url" name="url" inputmode="url" autocapitalize="off" spellcheck="false" value="${esc(pre.url || '')}"></div>
    <div class="field"><label for="ss-label">Name</label><input class="input" id="ss-label" name="label" maxlength="60" autocomplete="off" value="${esc(pre.label || '')}"></div>
    <div class="field"><label for="ss-sector">Sector</label><input class="input" id="ss-sector" name="sector" list="ss-list" maxlength="40" autocomplete="off" value="${esc(sector || '')}"><datalist id="ss-list">${C.sectorOptions(X.shows).map((o) => `<option value="${esc(o.name)}">`).join('')}</datalist></div>
    <div class="actions d-acts">${pre.shared ? '<button class="btn" type="button" data-xa="add-show-blank">Add an exhibition</button>' : '<button class="btn" type="button" data-xa="close">Cancel</button>'}<button class="btn yellow" type="submit">Save search page</button></div></form>`);
}

/* ---------- Checking ---------- */
async function runChecks(id) {
  if (E.running) return;
  if (!showById(id)) return;
  const g = gen;
  Object.assign(E, { running: true, stop: false, showId: id, idle: 0 });
  if (onShow(id)) updateShowParts();
  let moved = false;
  try {
    while (!E.stop) {
      if (!(onShow(id) && document.visibilityState === 'visible')) { moved = document.visibilityState === 'visible'; break; }
      const r = await el('enrich', { showId: id, budget: 20 }, 70000);
      mergeRows(id, r.changed);
      if (r.usage) X.usage = C.usage(r.usage);
      X.offline = '';
      if (onShow(id)) updateShowParts();
      if (r.pending <= 0) break;
      if (!r.processed) {
        if (++E.idle > 20) break;
        await sleep(8000);
        await fetchRows(id).catch(() => {});
        if (onShow(id)) updateShowParts();
        if (!(X.rows[id] || []).some((x) => C.statusOf(x) === 'pending')) break;
      } else E.idle = 0;
    }
  } catch (e) { if (!isGone(e)) { X.offline = e && e.kind === 'network' ? errText(e) : ''; if (!e || e.kind !== 'network') toast(errText(e), true); } }
  finally {
    E.running = false;
    if (onShow(id)) updateShowParts();
    if (moved || g !== gen) ensureChecking();   // signed out and in again meanwhile: the new session's checks start now
  }
}
async function runAllChecks() {
  if (E.running) return;
  const inList = () => api.isHere() && (X.route.v === 'home' || X.route.v === 'sector') && document.visibilityState === 'visible';
  const g = gen;
  Object.assign(E, { running: true, stop: false, showId: '*', idle: 0 });
  refresh();
  let moved = false;
  try {
    while (!E.stop) {
      if (!inList()) { moved = true; break; }
      const ids = X.route.v === 'sector' ? X.shows.filter((x) => x.sector === X.route.sector && (x.counts || {}).pending > 0).map((x) => x.id) : null;
      if (ids && !ids.length) break;
      const r = await el('enrich', ids ? { showId: ids[0], budget: 20 } : { budget: 20 }, 70000);
      const by = {};
      (r.changed || []).forEach((x) => { (by[x.showId] = by[x.showId] || []).push(x); });
      Object.keys(by).forEach((id) => { if (X.rows[id]) mergeRows(id, by[id]); });
      if (r.usage) X.usage = C.usage(r.usage);
      await loadShows(true);
      if (r.pending <= 0 && !ids) break;
      if (!r.processed) { if (++E.idle > 20) break; await sleep(8000); } else E.idle = 0;
    }
  } catch (e) { if (!isGone(e) && (!e || e.kind !== 'network')) toast(errText(e), true); }
  finally {
    E.running = false;
    refresh();
    if (moved || g !== gen) ensureChecking();
  }
}
function ensureChecking() {
  if (E.running || E.userPaused || !X.loaded || !here()) return;
  const r = X.route;
  if (r.v === 'show') { if ((X.rows[r.id] || []).some((x) => C.statusOf(x) === 'pending')) runChecks(r.id); }
  else if (r.v === 'home' || r.v === 'sector') {
    const pending = X.shows.filter((s) => r.v !== 'sector' || s.sector === r.sector).reduce((a, s) => a + ((s.counts || {}).pending || 0), 0);
    if (pending > 0) runAllChecks();
  }
}
// While leads wait and nothing is checking here (paused, say), the counts still follow the background run.
setInterval(() => {
  if (!api || !X.loaded || E.running || !here() || !(X.route.v === 'home' || X.route.v === 'sector')) return;
  if (X.shows.some((s) => (s.counts || {}).pending > 0)) loadShows(true);
}, 60000);
window.addEventListener('online', () => { if (api && X.offline && api.isHere()) act('retry', document.body); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !api || !X.loaded || !api.isHere()) return;
  if (X.route.v === 'show') { const id = X.route.id; fetchRows(id).then(() => { if (onShow(id)) updateShowParts(); ensureChecking(); }).catch(() => {}); if (Date.now() - ((X.pipe[id] || {}).at || 0) > 60000) loadPipe(id); }
  else loadShows(true).then(() => ensureChecking());
  loadPipeAll();
});

/* ---------- Events ---------- */
function onClick(e) {
  const t = e.target.closest('button, a, tr[data-xrow]');
  if (!t) return;
  const d = t.dataset;
  if (d.xrow) { selectRow(d.xrow); return; }
  if (d.xfilter) { X.filter = d.xfilter; X.limit = 200; if (dialogOpen()) closeDialog(); updateShowParts(); const box = document.getElementById('xs-chips'); if (box && d.xfilter === 'pipe-check') box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
  if (d.xcalls) { e.preventDefault(); const s = showById(d.xcalls); if (s) { if (onShow(s.id)) { X.filter = 'pipe-check'; X.limit = 200; updateShowParts(); } else { X.nextFilter = 'pipe-check'; go(hashFor.show(s.id)); } } return; }
  if (d.xnav) { e.preventDefault(); closeFind(); go(d.xnav); return; }
  if (d.xa) { if (t.tagName === 'A' && d.xa !== 'close') e.preventDefault(); act(d.xa, t, e); }
}
function selectRow(id) {
  X.sel = id;
  const tbl = document.querySelector('#xs-rows table');
  if (tbl) tbl.querySelectorAll('tr[data-xrow]').forEach((tr) => { const on = tr.dataset.xrow === id; tr.classList.toggle('sel', on); if (on) tr.setAttribute('aria-selected', 'true'); else tr.removeAttribute('aria-selected'); });
  setHtml('xs-detail', detailHtml());
  const aside = document.getElementById('xs-detail');
  if (aside) { aside.classList.add('open'); if (window.matchMedia('(max-width: 1100px)').matches) aside.scrollTop = 0; else if (aside.getBoundingClientRect().top < 0) aside.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
}
function onKey(e) {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-xrow]')) { selectRow(e.target.dataset.xrow); return; }
  if (e.key === 'Escape' && X.sel && !dialogOpen()) { X.sel = null; updateShowParts(); }
}
let qTimer;
function onInput(e) {
  const t = e.target;
  if (t.id === 'xs-q') { clearTimeout(qTimer); qTimer = setTimeout(() => { X.q = t.value; X.limit = 200; setHtml('xs-rows', rowsHtml(showById(X.route.id))); }, 150); return; }
  if (t.id === 'xd-q') { X.diaryQ = t.value; setHtml('xd-list', diaryList(X.route.sector)); return; }
  if (t.id === 'xfind-in') { renderFind(t.value); return; }
  if (t.id === 'sf-urls') {
    const grew = t.value.length - (+t.dataset.len || 0);
    const f = $('#xshow', dlg);
    if (f && !f.dataset.id && f.dataset.contact) { f.dataset.contact = ''; const lo = $('#sf-look .look-org', dlg); if (lo) lo.remove(); }
    t.dataset.len = t.value.length;
    if (/^insertFromPaste|^insertFromDrop/.test(e.inputType || '') || grew > 15) { if (!linkBoxToList()) { const k = C.linkBoxKind(t.value); if (k.kind === 'links' && k.urls.length === 1) lookUp(k.urls[0]); } }
  }
}
function renderFind(text) {
  const box = document.getElementById('xfind-list');
  if (!box) return;
  const q = String(text || '').trim().toLowerCase();
  if (!q) { box.hidden = true; box.innerHTML = ''; return; }
  const secs = C.sectorOptions(X.shows, text).slice(0, 5);
  const shows = X.shows.filter((s) => String(s.name).toLowerCase().indexOf(q) >= 0 || String(s.venue || '').toLowerCase().indexOf(q) >= 0).slice(0, 6);
  box.innerHTML = secs.map((o) => `<a class="opt" href="${esc(hashFor.sector(o.name))}" data-xnav="${esc(hashFor.sector(o.name))}"><span class="ldot" style="background:${lineOf(o.name)}"></span><b>${esc(o.name)}</b><span>${o.shows ? plural(o.shows, 'exhibition') : 'sector'}</span></a>`).join('')
    + shows.map((s) => `<a class="opt" href="${esc(hashFor.show(s.id))}" data-xnav="${esc(hashFor.show(s.id))}"><span class="ldot" style="background:${lineOf(s.sector)}"></span><b>${esc(s.name)}</b><span>${esc(C.fmtDates(s.start, s.end))}</span></a>`).join('')
    + (secs.some((o) => o.name.toLowerCase() === q) ? '' : `<button class="opt" type="submit"><span class="ldot"></span><b>Use “${esc(C.cleanSector(text))}” as a sector</b><span>New</span></button>`);
  box.hidden = false;
}
function closeFind() { const b = document.getElementById('xfind-list'); if (b) { b.hidden = true; b.innerHTML = ''; } }
document.addEventListener('click', (e) => { if (!e.target.closest('#xfind')) closeFind(); });

async function onSubmit(e) {
  const f = e.target;
  if (!f || !f.id || !/^x/.test(f.id)) return;
  e.preventDefault();
  if (f.id === 'xfind') {
    const r = C.resolveSector($('#xfind-in').value, X.shows);
    if (!r.sector) { toast(r.matches.length ? 'Choose one from the list, or keep typing' : 'Type a sector, or choose one from the list'); return; }
    closeFind(); go(hashFor.sector(r.sector));
  } else if (f.id === 'xshow') submitShow(f);
  else if (f.id === 'xgo') submitGo(f);
  else if (f.id === 'xpaste') {
    const text = f.text.value.trim();
    if (!text) { toast('Paste at least one name', true); return; }
    await withBusy(f.querySelector('[type=submit]'), async () => {
      try {
        const r = await el('pasteList', { showId: f.dataset.id, text });
        closeDialog(); await loadShows(true, true); await fetchRows(f.dataset.id).catch(() => {});
        E.userPaused = false; if (onShow(f.dataset.id)) updateShowParts(); else go(hashFor.show(f.dataset.id));
        ensureChecking();
        toast(`${plural(r.added, 'exhibitor')} added${r.skipped ? `, ${r.skipped} already there` : ''}`);
      } catch (err) { toast(errText(err), true); }
    });
  } else if (f.id === 'xedit') {
    const patch = {};
    ['contact', 'email', 'phone', 'website', 'note'].forEach((k) => { patch[k] = f[k].value.trim(); });
    await withBusy(f.querySelector('[type=submit]'), async () => {
      try { const j = await el('editRow', { id: f.dataset.id, patch }); mergeRows(j.row.showId || X.route.id, [j.row]); closeDialog(); updateShowParts(); toast('Saved'); E.userPaused = false; ensureChecking(); }
      catch (err) { toast(errText(err), true); }
    });
  } else if (f.id === 'xcono') {
    await withBusy(f.querySelector('[type=submit]'), async () => {
      try { const j = await el('confirmMatch', { id: f.dataset.id, number: f.number.value }); mergeRows(j.row.showId || X.route.id, [j.row]); closeDialog(); updateShowParts(); toast('Company confirmed'); followConfirm(j.row); }
      catch (err) { toast(errText(err), true); }
    });
  } else if (f.id === 'xpick') {
    const q = f.q.value.trim();
    if (q.length < 2) { toast('Type at least two letters, or the company number'); return; }
    X.pick = { id: f.dataset.id, q, items: null, err: '' };
    const mine = X.pick;
    await withBusy(f.querySelector('[type=submit]'), async () => {
      try { const j = await el('searchCompanies', { q }, 30000); mine.items = j.items || []; } catch (err) { mine.err = errText(err); }
      const box = $('#xpick-list', dlg); if (box && X.pick === mine) box.innerHTML = pickListHtml();
    });
  } else if (f.id === 'xrename') submitRename(f);
  else if (f.id === 'xsearchpage') {
    const sector = C.matchSector(f.sector.value, X.shows) || String(f.sector.value || '').trim();
    const url = C.validUrl(f.url.value.trim());
    if (!url) { toast('Paste the page address, starting https://', true); return; }
    if (!sector) { toast('Choose a sector for it', true); return; }
    await withBusy(f.querySelector('[type=submit]'), async () => {
      try { const j = await el('saveSearch', { sector, url, label: f.label.value.trim() }); X.searches = j.searches || {}; closeDialog(); refresh(); toast(`Saved under Find exhibitions for ${sector}`); }
      catch (err) { toast(errText(err), true); }
    });
  }
}
async function submitRename(f) {
  const from = f.dataset.sector, to = C.matchSector(new FormData(f).get('name'), X.shows.filter((x) => x.sector !== from));
  if (!to) { toast('Add a sector name', true); return; }
  const mine = X.shows.filter((x) => x.sector === from);
  if (to === from || !mine.length) { closeDialog(); return; }
  await withBusy(f.querySelector('[type=submit]'), async () => {
    try {
      for (const x of mine) await el('saveShow', { id: x.id, name: x.name, sector: to, start: x.start || '', end: x.end || '', urls: (x.urls || []).join('\n') });
      try { const j = await el('saveSearch', { from, to }); X.searches = j.searches || X.searches; } catch (e) { /* an older script: pages stay under the old name */ }
      closeDialog(); await loadShows(true, true); go(hashFor.sector(to)); toast(`Renamed to ${to}`);
    } catch (e) { await loadShows(true, true); toast(errText(e), true); }
  });
}

async function act(name, t) {
  const d = t.dataset, s = X.route.v === 'show' ? showById(X.route.id) : (d.id ? showById(d.id) : null);
  switch (name) {
    case 'close': closeDialog(); break;
    case 'retry': X.err = ''; X.offline = ''; if (!X.loaded) api.rerender(); await loadShows(); if (X.route.v === 'show') enterShow(X.route.id); break;
    case 'hide-usage': X.usageHidden = X.usage ? X.usage.message.replace(/\d+%/, '') : ''; refreshNotices(); break;
    case 'add-show': openAddShow(null); break;
    case 'add-show-blank': openAddShow(null); break;
    case 'sf-mode': setShowMode(d.mode); if (d.mode === 'list') linkBoxToList(); break;
    case 'save-listing': { const f = $('#xshow', dlg); openAddSearch(f ? C.matchSector(f.sector.value, X.shows) || f.sector.value : '', { url: d.url, shared: true, host: (/^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(d.url) || [])[1] }); break; }
    case 'add-search': openAddSearch(X.route.v === 'sector' ? X.route.sector : ''); break;
    case 'remove-search': if (X.route.v === 'sector') await withBusy(t, async () => { try { const j = await el('saveSearch', { sector: X.route.sector, url: d.url, remove: true }); X.searches = j.searches || {}; refresh(); toast('Search page removed'); } catch (e) { toast(errText(e), true); } }); break;
    case 'rename-sector': if (X.route.v === 'sector') openRename(X.route.sector); break;
    case 'sector-csv': await withBusy(t, () => downloadSector(X.route.sector)); break;
    case 'diary-type': X.diaryType = d.type || 'all'; api.rerender(); break;
    case 'diary-retry': loadDiary(X.route.sector, true); if (X.route.v === 'diary') api.rerender(); else refresh(); break;
    case 'diary-add': { const e = diaryEntry(d.i); if (e) openAddShow(Object.assign(C.diaryPrefill(e, X.route.sector), { diary: true })); break; }
    case 'attendance': openAttendance(d.i === 'show' ? (s && C.diaryEntryFor(s, diaryData(s.sector))) : diaryEntry(d.i)); break;
    case 'go': if (s) {
      // Go only with this show's own pipeline record in hand, or it could overwrite going, days and page
      if (!pipeData(s.id)) await withBusy(t, () => loadPipe(s.id));
      if (!pipeData(s.id)) { toast('Couldn’t read the pipeline for this show, so Go waits. Try again in a moment.', true); break; }
      openGo(s);
    } break;
    case 'pipe-retry': if (s) loadPipe(s.id); break;
    case 'load': if (s) { closeDialog(); loadList(s, t.closest('.dialog') ? null : t); } break;
    case 'paste': if (s) openPaste(s); break;
    case 'show-menu': if (s) openShowMenu(s); break;
    case 'edit-show': if (s) openDialog(dhead('Edit exhibition', s.name) + showForm(s)); break;
    case 'csv': if (s) downloadShow(s, false); break;
    case 'csv-shown': if (s) { closeDialog(); downloadShow(s, true); } break;
    case 'find-organiser': if (s) await withBusy(t, () => findOrganiser(s, false)); break;
    case 'clear-organiser': if (s) await withBusy(t, () => findOrganiser(s, true)); break;
    case 'delete-show': if (s) openConfirm('Delete this exhibition?', `${s.name} and its exhibitors will be removed from the Exhibitor Leads sheet. This can’t be undone.`, 'delete-show-yes', 'Delete exhibition', s.id, true); break;
    case 'delete-show-yes': await withBusy(t, async () => { try { await el('deleteShow', { id: d.id }); delete X.rows[d.id]; X.shows = X.shows.filter((x) => x.id !== d.id); closeDialog(); toast('Exhibition deleted'); go(hashFor.sector((s && s.sector) || 'General')); } catch (e) { toast(errText(e), true); } }); break;
    case 'confirm-likely': if (s) { closeDialog(); try { const j = await el('confirmLikely', { showId: s.id }); mergeRows(s.id, j.changed); updateShowParts(); toast(`${plural((j.changed || []).length, 'match', 'matches')} confirmed`); loadStatus(); } catch (e) { toast(errText(e), true); } } break;
    case 'recheck-weak': if (s) { closeDialog(); try { const j = await el('recheckWeak', { showId: s.id }); await fetchRows(s.id); E.userPaused = false; updateShowParts(); ensureChecking(); toast(j.queued ? `Checking ${plural(j.queued, 'business', 'businesses')} again` : 'Nothing to check again'); } catch (e) { toast(errText(e), true); } } break;
    case 'recheck-all': if (s) { closeDialog(); try { await el('recheck', { ids: (X.rows[s.id] || []).map((r) => r.id) }); await fetchRows(s.id); E.userPaused = false; updateShowParts(); ensureChecking(); toast('Checking everything again'); } catch (e) { toast(errText(e), true); } } break;
    case 'pause': E.stop = true; E.userPaused = true; refresh(); toast('Paused. The background checks carry on.'); break;
    case 'resume': E.userPaused = false; if (E.running) { E.stop = false; refresh(); break; } if (X.route.v === 'show') runChecks(X.route.id); else runAllChecks(); break;
    case 'more': X.limit += 200; setHtml('xs-rows', rowsHtml(s)); break;
    case 'close-row': X.sel = null; updateShowParts(); break;
    case 'copy': { const ok = await copyText(d.text || ''); toast(ok ? `${d.what || 'Text'} copied` : 'Couldn’t copy. Select it and copy instead', !ok); break; }
    case 'copy-why': toast((await copyText(X.whyText || '')) ? 'Copied' : 'Couldn’t copy. Select the text and copy instead'); break;
    case 'match-yes': case 'match-no': await withBusy(t, async () => { try { const j = await el('confirmMatch', { id: d.id, yes: name === 'match-yes' }); mergeRows(j.row.showId || X.route.id, [j.row]); updateShowParts(); toast(name === 'match-yes' ? 'Confirmed as the same company' : 'Marked as no company'); followConfirm(j.row); } catch (e) { toast(errText(e), true); } }); break;
    case 'find-co': openPicker(d.id); break;
    case 'company-no': openCompanyNo(d.id); break;
    case 'pick-co': openPickConfirm(+d.i); break;
    case 'pick-back': if (X.pick) openPicker(X.pick.id, X.pick); break;
    case 'pick-yes': { const p = X.pick || {}, c = (p.items || [])[+d.i]; if (!c) break; await withBusy(t, async () => { try { const j = await el('confirmMatch', { id: p.id, number: c.no }); mergeRows(j.row.showId || X.route.id, [j.row]); closeDialog(); updateShowParts(); toast('Company confirmed'); followConfirm(j.row); } catch (e) { toast(errText(e), true); } }); break; }
    case 'edit-row': { const r = rowById(d.id); if (r) openEditRow(r); break; }
    case 'recheck': await withBusy(t, async () => { try { await el('recheck', { ids: [d.id] }); await fetchRows(X.route.id); E.userPaused = false; updateShowParts(); ensureChecking(); toast('Checking this business again'); } catch (e) { toast(errText(e), true); } }); break;
    case 'explain': await withBusy(t, async () => { toast('Checking again without saving. This takes about 10 seconds', false, 6000); try { const j = await el('explain', { id: d.id }, 100000); openExplain(d.id, j); } catch (e) { toast(errText(e), true); } }); break;
    case 'remove-row': openConfirm('Remove this business?', 'It will be removed from this exhibition in the Exhibitor Leads sheet.', 'remove-row-yes', 'Remove', d.id, true); break;
    case 'remove-row-yes': await withBusy(t, async () => { try { await el('deleteRows', { ids: [d.id] }); const id = X.route.id; X.rows[id] = (X.rows[id] || []).filter((r) => r.id !== d.id); syncCounts(id); if (X.sel === d.id) X.sel = null; closeDialog(); updateShowParts(); toast('Removed'); } catch (e) { toast(errText(e), true); } }); break;
    case 'pipe-down': { const r = rowById(d.id); if (!r) break; await withBusy(t, async () => { try { await setCanEmail(r, 'Consent needed', 'Yes (Ltd)'); updateShowParts(); } catch (e) { toast(errText(e), true); } }); break; }
    case 'pipe-yes': case 'pipe-consent': case 'pipe-yes-sure': {
      const r = rowById(d.id);
      if (!r) break;
      if (name === 'pipe-yes' && C.statusOf(r) !== 'corporate') { openConfirm('Email them as a limited company?', `Exhibitor Leads hasn’t confirmed a limited company for ${r.name}. Only choose this if you’ve checked Companies House yourself: sole traders and partnerships can’t be cold-emailed.`, 'pipe-yes-sure', 'Yes, it’s a limited company', r.id); break; }
      await withBusy(t, async () => { try { await setCanEmail(r, name === 'pipe-consent' ? 'Consent needed' : 'Yes (Ltd)', 'Check'); closeDialog(); updateShowParts(); } catch (e) { toast(errText(e), true); } });
      break;
    }
    // Settings
    case 'notify-setup': await withBusy(t, openNotifySetup); break;
    case 'notify-test': await withBusy(t, async () => {
      let ok = true, msg = '';
      try { await el('testNotify', null, 30000); toast('Test sent. It should arrive in ntfy within a minute. If it doesn’t, look in Gmail for a bounce', false, 7000); }
      catch (e) { ok = false; msg = errText(e); toast(msg, true); }
      if (X.status && X.status.notify) { X.status = Object.assign({}, X.status, { notify: Object.assign({}, X.status.notify, { last: { at: new Date().toISOString(), kind: 'test', show: '', ok, error: msg } }) }); refreshSettings(); }
    }); break;
    case 'notify-off': await withBusy(t, async () => { try { await el('setNotify', { off: true }); X.status = Object.assign({}, X.status, { notify: { on: false, topic: '', click: false } }); setHtml('xset-body', settingsBody()); toast('Notifications are off'); } catch (e) { toast(errText(e), true); } }); break;
    case 'copy-topic': toast((await copyText(d.text || '')) ? 'Code copied' : 'Couldn’t copy. Select the code and copy instead'); break;
    case 'recheck-weak-all': case 'recheck-weak-consent-yes': closeDialog(); try { const j = await el('recheckWeak', name === 'recheck-weak-all' ? {} : { include: 'all' }); await loadShows(true, true); toast(j.queued ? `Checking ${plural(j.queued, 'business', 'businesses')} again. Open Exhibitors to watch it` : 'Nothing to check again', false, 6000); loadStatus(); } catch (e) { toast(errText(e), true); } break;
    case 'recheck-weak-consent': openConfirm('Include “consent needed” too?', 'These are mostly sole traders and businesses with no company on the register, so checking them again rarely changes anything, and it uses a lot of web requests. Businesses you confirmed are kept.', 'recheck-weak-consent-yes', 'Check them again'); break;
    case 'status-refresh': await withBusy(t, loadStatus); break;
  }
}
async function findOrganiser(s, clear) {
  try {
    const j = await el('findOrganiser', clear ? { id: s.id, clear: true } : { id: s.id }, 120000);
    const i = X.shows.findIndex((x) => x.id === s.id);
    if (i >= 0 && j.show) X.shows[i] = Object.assign({}, X.shows[i], j.show);
    closeDialog(); updateShowParts();
    toast(clear ? 'Organiser contact removed' : j.contact ? 'Found the organiser contact on its site' : j.kept ? 'Nothing new on its site, so the contact found before is kept' : 'No organiser contact on its site. Its own pages may not give one', false, 6000);
  } catch (e) { toast(errText(e), true); }
}
function downloadShow(s, onlyShown) {
  const rows = X.rows[s.id] || [];
  if (!rows.length) { toast('Nothing to download yet'); return; }
  let list = C.filterRows(rows, onlyShown && !/^pipe-/.test(X.filter) ? { filter: X.filter, q: X.q } : onlyShown ? { q: X.q } : {});
  if (onlyShown && /^pipe-/.test(X.filter)) list = list.filter((r) => pipeIs(r, X.filter));
  download(`exhibitor-leads-${C.slug(s.name)}-${today()}.csv`, C.toCsv(list, byId()));
  toast(`Saved ${plural(list.length, 'exhibitor')} to a CSV file`);
}
async function downloadSector(sector) {
  let rows;
  try { rows = (await el('rows', { sector })).rows; }
  catch (e) {
    rows = []; X.shows.filter((s) => s.sector === sector).forEach((s) => { rows = rows.concat(X.rows[s.id] || []); });
    if (!rows.length) { toast(errText(e), true); return; }
    toast('Couldn’t reach Exhibitor Leads, so this uses what was loaded earlier');
  }
  const merged = C.mergeBySite(C.filterRows(rows, {}), byId());
  download(`exhibitor-leads-${C.slug(sector)}-sector-${today()}.csv`, C.toCsv(merged, byId()));
  toast(`Saved ${plural(merged.length, 'business', 'businesses')} to a CSV file`);
}

/* ---------- Settings: an Exhibitor Leads panel on HQ's Settings page ---------- */
const UA = navigator.userAgent, isIOS = /iP(hone|ad|od)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), isAndroid = /Android/.test(UA);
function settingsHtml() {
  return `<section class="panel" id="xset" aria-labelledby="xset-h"><div class="panel-head"><div><span class="eyebrow">Exhibitor Leads</span><h2 class="h3" id="xset-h">Checks, notifications and usage</h2></div>
    <button class="btn small" type="button" data-xa="status-refresh">Check again</button></div><div id="xset-body">${settingsBody()}</div></section>`;
}
function bindSettings(box) {
  if (!box) return;
  box.onclick = onClick;
  if (!api.elUrl()) return;
  if (!X.statusLoading && Date.now() - X.statusAt > 60000) loadStatus();
  if (!X.loaded && !X.loading) loadShows(true);
}
function settingsBody() {
  if (!api || !api.elUrl()) return '<p class="sub" style="margin:0">Add EL_URL to HQ’s Script Properties to connect Exhibitor Leads.</p>';
  const st = X.status;
  if (!st) return `<p class="sub" style="margin:0">${X.statusLoading || !X.statusErr ? '<span class="spinner"></span> Asking Exhibitor Leads…' : esc(X.statusErr)}</p>`;
  const out = [`<ul class="pipe-facts"><li>Script release <b>${esc(st.build || 'older than ' + EXPECT_EL)}</b>${C.scriptOutdated(st.build || 0, EXPECT_EL) ? `: HQ expects ${EXPECT_EL}. Paste its new Code.gs and deploy a new version.` : ', up to date'}</li>
    <li>Companies House key: ${st.ch ? '<b>set</b>' : '<b>not set</b>, so company checks say consent needed'}</li><li>Background checks: ${st.trigger ? '<b>on</b>, every 10 minutes' : '<b>off</b>: run setup again in its Apps Script'}</li>
    ${st.sheetUrl ? `<li><a href="${esc(st.sheetUrl)}" target="_blank" rel="noopener">Open the Exhibitor Leads sheet</a></li>` : ''}</ul>`];
  const n = st.notify;
  out.push('<div class="d-sec"><span class="eyebrow">Notifications</span>' + (!n ? '<p class="sub" style="margin:0">These need release 12 of the Exhibitor Leads script.</p>'
    : n.on ? `<p class="sub" style="margin:0">On. You get a message in the ntfy app whenever a check finishes, whether or not HQ is open. It can take up to a minute.${isIOS ? '' : ' A tap on it opens that exhibition here.'}</p>${n.last ? `<p class="note${n.last.ok ? '' : ' bad'}" style="margin:0" role="status">${esc(lastNotifyLine(n.last))}</p>` : ''}<div class="row-acts"><button class="btn small" type="button" data-xa="notify-test">Send a test</button><button class="btn small" type="button" data-xa="notify-setup">Set-up steps</button><button class="btn small ghost" type="button" data-xa="notify-off">Turn off</button></div>`
    : '<p class="sub" style="margin:0">Get a message on your phone whenever a check finishes. It uses ntfy, a free notification app with no account. Shared with the Exhibitor Leads phone app.</p><div class="row-acts"><button class="btn small yellow" type="button" data-xa="notify-setup">Set up notifications</button></div>') + '</div>');
  const u = X.usage;
  if (u) out.push(`<div class="d-sec"><span class="eyebrow">Last 24 hours</span>${[['Web requests', u.fetches], ['Background minutes', u.bg]].map(([label, m]) => `<div class="use"><div class="use-row"><span>${label}</span><b>${esc(m.text)}</b></div><div class="lbar thin" role="img" aria-label="${esc(label + ': ' + m.text)}"><i class="${m.width >= 70 ? 'check-bg' : 'ok-bg'}" style="flex-grow:${m.width}"></i><i class="o-bg" style="flex-grow:${100 - m.width}"></i></div></div>`).join('')}<p class="note" style="margin:0">Counts this app only. Google counts everything on your account. A warning shows on Exhibitors above 70%.</p></div>`);
  const ev = C.evidenceRows(st.evidence), sp = C.speedLines(st.speed), rc = C.recheckSummary(st.recheck), rs = C.reachSummary(st.reach);
  const tone = (k) => ({ ok: 'ok', verified: 'ok', corporate: 'ok', check: 'check', consent: 'consent' }[k] || 'check');
  if (ev) out.push(`<div class="d-sec"><span class="eyebrow">How companies were matched</span><dl class="kv wide">${ev.rows.map((r) => `<dt><span class="sd ${tone(r.tone)}"></span> ${esc(r.label)}</dt><dd><b>${commas(r.n)}</b></dd>`).join('')}</dl><p class="note" style="margin:0">Across ${commas(ev.total)} checked businesses. A similar name alone stays “to check”; open any business and use Why this result? to see what was read.</p></div>`);
  if (rs && rs.sites) out.push(`<div class="d-sec"><span class="eyebrow">Websites that wouldn’t open</span><p class="sub" style="margin:0"><b style="color:var(--text)">${commas(rs.sites)}</b> of ${commas(rs.checked)} (${esc(rs.pct)}) couldn’t be read in full: ${rs.lines.map((l) => esc(l.text) + ' ' + commas(l.n)).join(' · ')}.</p></div>`);
  if (sp) out.push(`<div class="d-sec"><span class="eyebrow">Speed</span><p class="sub" style="margin:0">About <b style="color:var(--text)">${esc(sp.per)}</b> and ${esc(sp.requests)} web requests a business (last ${sp.n}), so roughly ${esc(sp.perHour)} an hour.</p>
    ${sp.parts.map((q) => `<div class="use"><div class="use-row"><span>${esc(q.label)}</span><b>${esc(q.text)}</b></div><div class="lbar thin" role="img" aria-label="${esc(q.label + ': ' + q.text)}"><i class="ok-bg" style="flex-grow:${q.width}"></i><i class="o-bg" style="flex-grow:${100 - q.width}"></i></div></div>`).join('')}
    <p class="note" style="margin:0">The home page, mail records and company search go out together, so their time shows under Home page.${sp.slowest.length ? ' Slowest sites lately: ' + sp.slowest.map((x) => esc(x.host) + ' (' + esc(x.text) + ')').join(', ') + '.' : ''}</p></div>`);
  if (rc) {
    const sh = rc.scope ? (showById(rc.scope) || {}).name : '';
    out.push(`<div class="d-sec"><span class="eyebrow">The last recheck</span><p class="sub" style="margin:0">${rc.queued ? `${plural(rc.queued, 'business', 'businesses')} ${rc.all ? 'that were “to check” or “consent needed”' : 'that were “to check”'} went back in the queue${sh ? ' for ' + esc(sh) : rc.scope ? '' : ' across every exhibition'}.` : 'Nothing needed checking again.'}${rc.pending ? ` <b style="color:var(--text)">${commas(rc.pending)} still waiting.</b>` : rc.queued ? ' All done.' : ''}</p>
      <table class="xt mini-t"><thead><tr><th scope="col"><span class="sr">Result</span></th><th scope="col" class="r">Before</th><th scope="col" class="r">Now</th></tr></thead><tbody>${rc.rows.map((r) => `<tr><td><span class="st-txt"><span class="sd ${STATUS_DOT[r.key]}"></span>${esc(r.label)}</span></td><td class="r">${commas(r.before)}</td><td class="r"><b>${commas(r.now)}</b></td></tr>`).join('')}</tbody></table>
      ${rc.gained ? `<p class="note" style="margin:0">${plural(rc.gained, 'more business', 'more businesses')} can now be emailed without asking first.</p>` : ''}</div>`);
  }
  const tc = totals(X.shows).check;
  if (tc) out.push(`<div class="d-sec"><span class="eyebrow">Check the “to check” ones again</span><p class="sub" style="margin:0">${plural(tc, 'business', 'businesses')} across your exhibitions ${tc === 1 ? 'is' : 'are'} “to check”. This runs them through the newer company rules. Try one exhibition first from its options.</p>
    <div class="row-acts"><button class="btn small" type="button" data-xa="recheck-weak-all">Check them all again</button><button class="btn small ghost" type="button" data-xa="recheck-weak-consent">Include consent needed</button></div></div>`);
  out.push('<p class="note" style="margin:0">For your own prospecting. Company status comes from Companies House and email setup from public mail records. Sole traders can’t be confirmed from the register, so anything unconfirmed is marked as needing consent. A guide only, not legal advice.</p>');
  return out.join('');
}
/** What the last message did, in words: a check that finishes in the background has no screen to say so. */
function lastNotifyLine(l) {
  const d = l && l.at ? new Date(l.at) : null;
  if (!d || isNaN(d)) return '';
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
  const when = d.toDateString() === new Date().toDateString() ? time : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d) + ', ' + time;
  const what = l.kind === 'test' ? 'the test message' : 'the message for ' + (l.show || 'a check');
  return l.ok ? `Last message: ${what} was sent at ${when}.` : `Last message: ${what} couldn’t be sent at ${when}. ${l.error || ''}`.trim();
}
async function openNotifySetup() {
  const have = X.status && X.status.notify && X.status.notify.topic;
  const topic = have || C.makeTopic((n) => crypto.getRandomValues(new Uint8Array(n)));
  // A tap on the message opens Exhibitors in HQ (through exhibitors/, which forwards here). Not on iPhone: no link there.
  try { await el('setNotify', { topic, url: isIOS ? '' : new URL('exhibitors/', location.href).href }); } catch (e) { toast(errText(e), true); return; }
  X.status = Object.assign({}, X.status, { notify: { on: true, topic, click: !isIOS } });
  setHtml('xset-body', settingsBody());
  const deep = `ntfy://ntfy.sh/${topic}?display=Exhibitor%20Leads`;
  openDialog(`${dhead('Get notifications', 'Exhibitor Leads')}<p class="sub" style="margin:0">Whenever a check finishes, ntfy tells you how many can be emailed.</p>
    <ol class="steps-n"><li><b>Install ntfy</b> A free notification app, no account needed. <a class="btn small" href="${isIOS ? 'https://apps.apple.com/app/ntfy/id1625396347' : isAndroid ? 'https://play.google.com/store/apps/details?id=io.heckel.ntfy' : 'https://ntfy.sh'}" target="_blank" rel="noopener">Get ntfy</a></li>
    <li><b>Subscribe to your code</b> ${isIOS ? 'In ntfy, tap +, paste the code as the topic and tap Subscribe.' : `<a class="btn small" href="${esc(deep)}">Connect ntfy</a> or subscribe by hand with the code.`} <span class="copy"><span class="mono">${esc(topic)}</span><button class="copy-btn" type="button" data-xa="copy-topic" data-text="${esc(topic)}" aria-label="Copy the code">${I.copy}</button></span></li>
    ${isAndroid ? '<li><b>Turn on instant delivery</b> In ntfy, open Exhibitor Leads, tap ⋮ and enable instant delivery.</li>' : ''}</ol>
    <div class="actions d-acts"><button class="btn" type="button" data-xa="notify-test">Send a test</button><button class="btn yellow" type="button" data-xa="close">Done</button></div>`);
}

/* ---------- To hq.js ---------- */
function reset() {
  gen++;
  Object.assign(X, { loading: false, pipeAllLoading: null, statusLoading: false, statusAt: 0, statusErr: '', diaryLoading: {} });
  Object.assign(X, { shows: [], searches: {}, loaded: false, loading: false, loadedAt: 0, err: '', rows: {}, rowsAt: {}, pipe: {}, pipeAll: null, pipeAllAt: 0, status: null, build: null, usage: null, offline: '', sel: null, pick: null, whyText: '', shared: null });
  Object.assign(E, { stop: true, userPaused: false });
  closeDialog();
}
window.HQX = {
  init(a) { api = a; },
  html, bind, settingsHtml, bindSettings, reset,
  leave() { closeDialog(); },
};
})();
