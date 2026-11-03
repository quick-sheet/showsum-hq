/* Showsum HQ · Exhibitors: the Exhibitor Leads app inside HQ (release 24 of the app, moved here in HQ release 7). */
(() => {
'use strict';
const C = window.Core;
const LOAD_FAIL = '<section class="hero"><h1 class="empty-title">Exhibitor Leads could not load</h1><p class="empty-body">Part of the app did not arrive. Close it fully and open it again.</p></section>';
if (!C) { document.getElementById('main').innerHTML = LOAD_FAIL; return; }

/* ---------- Platform ---------- */
const UA = navigator.userAgent;
const isIOS = /iP(hone|ad|od)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isAndroid = /Android/.test(UA);


/* ---------- Storage ---------- */
// Showsum HQ keeps your exhibitors in memory only while this page is open: nothing is saved on the device.
const MEM = new Map();
const get = (k, d) => { const v = MEM.get(k); return v == null ? d : JSON.parse(v); };
const put = (k, v) => { MEM.set(k, JSON.stringify(v)); };
const drop = (k) => { MEM.delete(k); };

const THEMES = [
  { id: 'hq', name: 'Showsum HQ', bg: '#0e0f13', card: '#16181e', accent: '#ffd23f' },
  { id: 'harbour', name: 'Harbour', bg: '#0E1426', card: '#161D36', accent: '#F2C063' },
  { id: 'graphite', name: 'Graphite', bg: '#121315', card: '#1B1D20', accent: '#6CAAFF' },
  { id: 'forest', name: 'Forest', bg: '#0D1512', card: '#15201B', accent: '#CDB06A' },
  { id: 'aubergine', name: 'Aubergine', bg: '#150F1C', card: '#1F1729', accent: '#F29DBF' },
  { id: 'porcelain', name: 'Porcelain', bg: '#F5F4EF', card: '#FFFFFF', accent: '#0B6B6B' },
  { id: 'stone', name: 'Stone', bg: '#F2EDE5', card: '#FCF9F4', accent: '#B04526' },
  { id: 'sage', name: 'Sage', bg: '#EEF1EA', card: '#FAFBF8', accent: '#2D6A3C' },
  { id: 'sky', name: 'Sky', bg: '#EDF1F7', card: '#FBFCFE', accent: '#3D4DC0' },
];

const S = {
  api: get('api', null),            // { url, token }
  shows: get('shows', []),
  searches: get('searches', {}),
  showsAt: get('showsAt', 0),
  rows: {},                         // showId -> rows
  route: { v: 'home' },
  diaries: {}, diaryType: 'all',   // the show diaries read this session, and the type chosen on the diary screen
  filter: 'all', q: '', limit: 200,
  set: Object.assign({ theme: 'hq', lastSector: '' }, get('settings', {})),
  boot: 'starting',                  // starting · connect (HQ not connected here) · signin · noel (EL_URL not set) · ready
  pipe: {},                          // showId -> the pipeline's side of that show, from the HQ script
  pipeChecks: null,                  // pipeline rows waiting for a Companies House check, by show
  status: get('status', null),
  build: get('build', null),
  usage: null,                      // the last 24 hours, from the sheet. Never saved, so it is never stale
  usageHidden: '',
  offline: false, offlineMsg: '',
  installEvt: null,
  shared: null,
  busy: {},
};
const E = { running: false, stop: false, showId: null, idle: 0 };   // the checking loop
const saveSet = () => put('settings', S.set);

/* ---------- Helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = C.esc;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const showById = (id) => S.shows.find((s) => s.id === id);
const today = () => C.todayIso();

let toastTimer, toastHide;
/** A message at the bottom that stays, with a spinner, until toast() replaces it with the answer. */
function busyToast(msg) {
  toast(msg);
  clearTimeout(toastTimer); clearTimeout(toastHide);
  $('#toast').innerHTML = '<span class="spinner" aria-hidden="true"></span>' + esc(msg);
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  clearTimeout(toastTimer); clearTimeout(toastHide);
  // Shown as a popover so it sits above an open sheet. Showing it again puts it back on top. An older browser just shows it as before.
  try { if (t.showPopover) { if (t.matches(':popover-open')) t.hidePopover(); t.showPopover(); } } catch (e) { /* no popover support */ }
  void t.offsetWidth;   // so it fades in rather than appearing
  t.classList.add('show');
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    toastHide = setTimeout(() => { try { if (t.matches(':popover-open')) t.hidePopover(); } catch (e) { /* no popover support */ } }, 260);
  }, Math.max(2600, msg.length * 55));
}

/** Takes the message away at once (the answer is on screen instead). */
function hideToast() {
  const t = $('#toast');
  clearTimeout(toastTimer); clearTimeout(toastHide);
  t.classList.remove('show');
  try { if (t.matches(':popover-open')) t.hidePopover(); } catch (e) { /* no popover support */ }
}

const ICON = {
  allDone: '<svg class="tick" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/><path d="M6 10.4l2.7 2.7L14.2 7.4"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.6" height="12" rx="1.2"/><rect x="13.4" y="6" width="3.6" height="12" rx="1.2"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 6.2v11.6c0 .8.9 1.3 1.6.8l8.6-5.8c.6-.4.6-1.2 0-1.6l-8.6-5.8c-.7-.5-1.6 0-1.6.8z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 16 16 8M9.5 8H16v6.5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  browse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9s1.3-6.2 3.9-9z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.5" r="2.5"/><path d="M15.6 14.6c2.4-.2 4.3 1.4 4.9 4.4"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4.5 7.5l7.5 5.5 7.5-5.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.6 3.5h2.6l1.4 4.1-2 1.4a12 12 0 0 0 6.4 6.4l1.4-2 4.1 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/></svg>',
  approx: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 6.2c1.6-1.4 3.4-1.4 5 0s3.4 1.4 5 0M3 10.6c1.6-1.4 3.4-1.4 5 0s3.4 1.4 5 0"/></svg>',
  dash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 8h8"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/></svg>',
  exhibitors: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9.5 3h5v3h-5zM8.5 11h7M8.5 14.5h7M8.5 18h4"/></svg>',
  warn: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.3" stroke-width="1.5"/><path d="M8 4.7v4M8 11.2v.1" stroke-width="1.8"/></svg>',
  later: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="6.3" stroke-width="1.5" stroke-dasharray="2.3 2.1"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 9l9 5 9-5-9-5Z"/><path d="M3 14l9 5 9-5"/></svg>',
};

class ApiError extends Error {}

/* ---------- Showsum HQ: your HQ sign-in, and HQ's own script ----------
 * HQ saved its connection (its script's address and your sign-in client) when you connected it; config.js pins it. Your
 * sign-in lives in this tab only, shared with HQ's other pages. Exhibitor Leads (release 19) and the HQ script both check it. */
const HQ = (() => {
  const SETUP = window.HQ_SETUP || {};
  const CLIENT_RE = /^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/;
  const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  const PIN = /^[A-Za-z0-9_-]{22}$/.test(SETUP.scriptPin || '') ? SETUP.scriptPin : '';
  const SS_TOKEN = 'hq.idToken';
  let config = null, token = null, gsi = null, waiters = [];
  const sget = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const sset = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } };
  const claims = (t) => { try { let x = String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); while (x.length % 4) x += '='; return JSON.parse(decodeURIComponent(escape(atob(x)))); } catch (e) { return null; } };
  const fresh = (t, margin) => { const c = claims(t); return !!(c && c.exp && c.exp * 1000 > Date.now() + (margin || 0) * 1000); };
  const pinOf = (url) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)).then((buf) => {
    let bin = ''; new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 22);
  });

  /** 'ready', 'signin' (needs a sign-in here) or 'connect' (HQ isn't connected on this device, or is pinned to another script). */
  async function init() {
    try { config = JSON.parse(localStorage.getItem('hq.config') || 'null'); } catch (e) { config = null; }
    if (config && CLIENT_RE.test(SETUP.clientId || '')) config.clientId = SETUP.clientId;
    if (!config || !URL_RE.test(config.url || '') || !CLIENT_RE.test(config.clientId || '')) return 'connect';
    if (PIN && (await pinOf(config.url)) !== PIN) return 'connect';
    const t = sget(SS_TOKEN);
    if (t && fresh(t, 60)) { token = t; return 'ready'; }
    return 'signin';
  }

  function loadGsi() {
    if (gsi) return gsi;
    gsi = new Promise((resolve, reject) => {
      if (window.google && google.accounts && google.accounts.id) { resolve(); return; }
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.defer = true;
      sc.onload = () => resolve();
      sc.onerror = () => { gsi = null; reject(new Error('Google sign-in didn’t load. Check you’re online.')); };
      document.head.appendChild(sc);
    }).then(() => {
      google.accounts.id.initialize({ client_id: config.clientId, callback: onCredential, auto_select: true, cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true, itp_support: true, context: 'signin' });
    });
    return gsi;
  }
  function onCredential(resp) {
    const t = resp && resp.credential;
    if (!t || !fresh(t, 30)) { toast('That sign-in didn’t work. Try again.'); return; }
    token = t; sset(SS_TOKEN, t);
    const w = waiters; waiters = [];
    S.reauth = false;
    if (w.length) { w.forEach((fn) => fn()); renderNotices(); return; }
    if (S.boot === 'signin') connectEl();
  }
  /** The sign-in button, for when Google can't sign you in by itself. */
  function button(slot, prompt) {
    if (!slot) return;
    loadGsi().then(() => {
      if (!slot.isConnected) return;
      google.accounts.id.renderButton(slot, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', logo_alignment: 'left', width: 260 });
      if (prompt) { try { google.accounts.id.prompt(); } catch (e) { /* the button is there */ } }
    }, (e) => { slot.textContent = e.message; });
  }
  /** Google couldn't sign you in by itself: the sign-in screen before the page is ready, a notice with the button after. */
  function needSignin() {
    if (S.boot === 'ready') { S.reauth = true; renderNotices(); } else { S.boot = 'signin'; render(); }
  }
  /** A fresh sign-in without leaving the page (Google's one-tap). Falls back to the sign-in screen. */
  function reauth() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters = waiters.filter((x) => x !== done); reject(new ApiError('Sign in again to carry on.')); }, 90000);
      const done = () => { clearTimeout(timer); resolve(); };
      waiters.push(done);
      loadGsi().then(() => {
        try {
          google.accounts.id.prompt((n) => {
            const shown = n && typeof n.isDisplayed === 'function' ? n.isDisplayed() : true;
            if ((n && typeof n.isNotDisplayed === 'function' && n.isNotDisplayed()) || (n && typeof n.isSkippedMoment === 'function' && n.isSkippedMoment()) || !shown) needSignin();
          });
        } catch (e) { needSignin(); }
      }, () => { needSignin(); });
    });
  }
  async function ready() { if (!(token && fresh(token, 60))) await reauth(); }

  /** Calls the HQ script (its address stays in HQ's own settings). */
  async function call(action, data, ms, retried) {
    await ready();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms || 60000);
    let j;
    try {
      const r = await fetch(config.url, { method: 'POST', body: JSON.stringify(Object.assign({ action, idToken: token }, data || {})), signal: ctl.signal, redirect: 'follow', credentials: 'omit' });
      j = await r.json();
    } catch (e) {
      const err = new ApiError(e && e.name === 'AbortError' ? 'Your HQ script took too long to answer' : 'Couldn’t reach your HQ script');
      err.net = true; throw err;
    } finally { clearTimeout(timer); }
    if (j && j.error === 'signin') {
      // an old sign-in: get a fresh one quietly and try once more. A fresh one refused means this account isn't the owner.
      if (!retried && !fresh(token, 300)) { await reauth(); return call(action, data, ms, true); }
      throw new ApiError('Your HQ script didn’t accept this sign-in. Sign in with the account HQ is set up for.');
    }
    if (j && j.error === 'retry') throw new ApiError(j.message || 'Try again in a moment.');
    if (j && j.error === 'Unknown action') throw new ApiError('Your HQ script is older than release 7. Paste the new Code.gs and deploy a new version.');
    if (!j || j.error) throw new ApiError((j && j.error) || 'Something went wrong.');
    return j;
  }
  return { init, button, reauth, ready, call, token: () => token, fresh: (sec) => !!token && fresh(token, sec) };
})();

/* ---------- Talking to the sheet ---------- */

async function call(action, data, ms, retried) {
  if (!S.api) throw new ApiError('Exhibitor Leads isn’t connected yet');
  if (action !== 'ping') await HQ.ready();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms || 60000);
  let j;
  try {
    const body = Object.assign({ action }, action === 'ping' ? {} : { idToken: HQ.token() }, data || {});
    const r = await fetch(S.api.url, { method: 'POST', body: JSON.stringify(body), signal: ctl.signal, redirect: 'follow', credentials: 'omit' });
    j = await r.json();
  } catch (e) {
    const err = new Error(e && e.name === 'AbortError' ? 'Exhibitor Leads took too long to answer' : 'Could not reach Exhibitor Leads');
    err.net = true;
    throw err;
  } finally { clearTimeout(timer); }
  if (j && j.error === 'signin' && !retried && !HQ.fresh(300)) { await HQ.reauth(); return call(action, data, ms, true); }
  if (j && j.error === 'retry') throw new ApiError(j.message || 'Try again in a moment.');
  if (j && j.error) throw new ApiError(j.error === 'signin' || j.error === 'Unauthorised' ? 'Exhibitor Leads didn’t accept your HQ sign-in. Check its Script Properties (Settings here says how).' : j.error);
  return j || {};
}

function setOffline(err) {
  S.offline = !!(err && err.net);
  S.offlineMsg = err ? err.message : '';
  renderNotices();
}

/* ---------- Data ---------- */
function totals() {
  const t = { total: 0, done: 0, corporate: 0, consent: 0, check: 0, google: 0, microsoft: 0, pending: 0 };
  S.shows.forEach((s) => { const c = s.counts || {}; Object.keys(t).forEach((k) => { t[k] += c[k] || 0; }); });
  return t;
}

// The same warning stays hidden once dismissed, even as the percentage creeps up. A change of kind brings it back.
const usageKey = () => (S.usage && S.usage.warn ? S.usage.message.replace(/\d+%/, '') : '');

function setUsage(u) {
  S.usage = C.usage(u);
  renderNotices();
  const box = $('#usageBox');
  if (box && sheet.open) box.outerHTML = usageHtml();
}

// The sheet's own summary of its checks (how matches were made, speed, rechecks). Optional: Settings simply shows what it last had.
// A phone updated before the Apps Script was: the sheet does not know the new action yet.
const oldScript = (e) => (/unknown action/i.test(e.message || '') ? 'Your Exhibitor Leads script needs its new version first: paste release 19 and deploy a new version.' : e.message);

// The release of Apps Script code this app expects. Shown in Settings; a warning appears when the script behind the app is older.
const EXPECT_BUILD = 19;

async function checkBuild() {
  if (!S.api) return;
  try { const j = await call('ping', null, 20000); S.build = +j.build || 0; put('build', S.build); renderNotices(); } catch (e) { /* offline: keep what we knew */ }
}

async function refreshStatus() {
  if (!S.api) return;
  try { const j = await call('status'); S.status = j; put('status', j); setUsage(j.usage); } catch (e) { /* not needed to carry on */ }
}

async function refreshShows() {
  if (!S.api) return false;
  try {
    const j = await call('list');
    const changed = JSON.stringify(j.shows || []) !== JSON.stringify(S.shows) || (j.searches && JSON.stringify(j.searches) !== JSON.stringify(S.searches));
    S.shows = j.shows || [];
    if (j.searches) { S.searches = j.searches; put('searches', S.searches); }
    setUsage(j.usage);
    S.showsAt = Date.now();
    put('shows', S.shows); put('showsAt', S.showsAt);
    setOffline(null);
    if (changed && (S.route.v === 'home' || S.route.v === 'sector' || S.route.v === 'diary')) renderMain();
    return true;
  } catch (e) { setOffline(e); if (!e.net) toast(e.message); return false; }
}

function cachedRows(id) { return get('rows.' + id, []); }
function saveRows(id) {
  put('rows.' + id, S.rows[id] || []);
  let ids = get('rowIds', []).filter((x) => x !== id);
  ids.unshift(id);
  ids.slice(6).forEach((old) => drop('rows.' + old));
  put('rowIds', ids.slice(0, 6));
}
function syncCounts(id) {
  const s = showById(id);
  if (s && S.rows[id]) { s.counts = C.countRows(S.rows[id]); put('shows', S.shows); }
}
async function fetchRows(id) {
  const j = await call('rows', { showId: id });
  S.rows[id] = j.rows || [];
  saveRows(id); syncCounts(id);
  setOffline(null);
}
function mergeRows(id, changed) {
  if (!changed || !changed.length) return;
  const list = S.rows[id] || (S.rows[id] = []);
  const at = new Map(list.map((r, i) => [r.id, i]));
  changed.forEach((r) => {
    if (at.has(r.id)) {
      const old = list[at.get(r.id)];
      if (old && old.alsoIn && !r.alsoIn) r.alsoIn = old.alsoIn;   // a check or an edit does not say which other exhibitions a business is in
      list[at.get(r.id)] = r;
    } else { at.set(r.id, list.length); list.push(r); }
  });
  saveRows(id); syncCounts(id);
}
const rowById = (id) => { const l = S.rows[S.route.showId] || []; return l.find((r) => r.id === id); };

/* ---------- Checking loop ---------- */
async function runChecks(id) {
  if (E.running) return;
  const show = showById(id);
  if (!show) return;
  Object.assign(E, { running: true, stop: false, showId: id, idle: 0 });
  updateShow();
  let moved = false;
  try {
    while (!E.stop) {
      if (!(S.route.v === 'show' && S.route.showId === id && document.visibilityState === 'visible')) { moved = document.visibilityState === 'visible'; break; }
      const r = await call('enrich', { showId: id, budget: 20 }, 70000);
      mergeRows(id, r.changed);
      if (r.usage) setUsage(r.usage);
      setOffline(null);
      updateShow();
      if (r.pending <= 0) break;
      if (!r.processed) {
        // someone else (the background check) has the rest: look again shortly
        if (++E.idle > 20) break;
        await sleep(8000);
        await fetchRows(id).catch(() => {});
        updateShow();
        if (!(S.rows[id] || []).some((x) => C.statusOf(x) === 'pending')) break;
      } else E.idle = 0;
    }
  } catch (e) {
    setOffline(e);
    if (!e.net) toast(e.message);
  } finally {
    E.running = false;
    updateShow();
    if (moved) ensureChecking();   // went to another screen: carry on there
  }
}
/**
 * On the home and sector screens the app checks too, across every exhibition with leads waiting, so a recheck started from
 * Settings moves while you watch instead of waiting for the background run. The counts come back from the sheet after each step.
 */
async function runAllChecks() {
  if (E.running) return;
  const here = () => (S.route.v === 'home' || S.route.v === 'sector') && document.visibilityState === 'visible';
  Object.assign(E, { running: true, stop: false, showId: '*', idle: 0 });
  let moved = false;
  renderMain();
  try {
    while (!E.stop) {
      if (!here()) { moved = true; break; }
      // on a sector's screen, that sector's exhibitions one after another; on the home screen, any exhibition
      const ids = S.route.v === 'sector' ? S.shows.filter((x) => x.sector === S.route.sector && (x.counts || {}).pending > 0).map((x) => x.id) : null;
      if (ids && !ids.length) break;
      const r = await call('enrich', ids ? { showId: ids[0], budget: 20 } : { budget: 20 }, 70000);
      const by = {};
      (r.changed || []).forEach((x) => { (by[x.showId] = by[x.showId] || []).push(x); });
      Object.keys(by).forEach((id) => { if (S.rows[id]) mergeRows(id, by[id]); });   // keep any exhibition already on the phone up to date
      if (r.usage) setUsage(r.usage);
      setOffline(null);
      await refreshShows();   // redraws the screen when the counts have moved
      if (r.pending <= 0 && !ids) break;
      if (!r.processed) { if (++E.idle > 20) break; await sleep(8000); } else E.idle = 0;
    }
  } catch (e) {
    setOffline(e);
    if (!e.net) toast(e.message);
  } finally {
    E.running = false;
    if (S.route.v === 'home' || S.route.v === 'sector') renderMain();
    if (moved) ensureChecking();   // went into an exhibition: carry on there
  }
}
/**
 * The first line of the leads: "163 exhibitors" with a tick once all are checked; while leads wait, "111 of 135 checked" with a
 * spinner (a still ring when paused), "24 waiting · about 2 minutes" under it, and a round pause or play button.
 */
function topLine(h, running) {
  const nums = `<strong class="num">${esc(h.n)}</strong> ${esc(h.text)}`;
  if (h.done) return `<li class="head done"><i class="lk mark">${ICON.allDone}</i><span>${nums}<span class="vh">, all checked</span></span></li>`;
  const per = S.status && S.status.speed && S.status.speed.seconds;
  return `<li class="head progress"><i class="lk mark" aria-hidden="true">${running ? '<span class="spinner"></span>' : '<span class="ring"></span>'}</i>
    <span>${nums}<span class="sub" role="status">${esc(C.waitingLine(h.pending, per, running))}</span></span>
    ${running ? `<button class="run-btn" type="button" data-act="pause" aria-label="Pause checking" title="Pause checking">${ICON.pause}</button>`
    : `<button class="run-btn go" type="button" data-act="resume" aria-label="Keep checking" title="Keep checking">${ICON.play}</button>`}</li>`;
}
const pendingAll = () => S.shows.filter((s) => S.route.v !== 'sector' || s.sector === S.route.sector).reduce((a, s) => a + ((s.counts || {}).pending || 0), 0);

function ensureChecking() {
  if (E.running || E.userPaused || !S.api || document.visibilityState !== 'visible') return;
  const id = S.route.showId;
  if (S.route.v === 'show') { if (id && (S.rows[id] || []).some((r) => C.statusOf(r) === 'pending')) runChecks(id); }
  else if ((S.route.v === 'home' || S.route.v === 'sector') && pendingAll() > 0) runAllChecks();
}
// While leads are waiting and nothing is checking here (paused, or offline a moment), the counts still follow the background run.
setInterval(() => {
  if (!S.api || E.running || document.visibilityState !== 'visible' || !(S.route.v === 'home' || S.route.v === 'sector') || !pendingAll()) return;
  refreshShows();
}, 60000);

/* ---------- Routing ---------- */
function go(route, replace) {
  const was = S.route;
  S.route = route;
  S.filter = 'all'; S.q = ''; S.limit = 200;
  // each step remembers the screen it came from, so going up can step back instead of adding to the history
  if (replace) history.replaceState({ r: route, prev: (history.state || {}).prev || null }, ''); else history.pushState({ r: route, prev: was || null }, '');
  E.userPaused = false;
  enter();
  window.scrollTo(0, 0);
}
/** The screen one level up: a sector goes home, an exhibition goes to its sector. Null on the home screen. */
function parentOf(r) {
  if (!r || r.v === 'home') return null;
  if (r.v === 'show') { const s = showById(r.showId); return s ? { v: 'sector', sector: s.sector } : { v: 'home' }; }
  if (r.v === 'diary') return { v: 'sector', sector: r.sector };
  return { v: 'home' };
}
const sameRoute = (a, b) => !!a && !!b && a.v === b.v && (a.v === 'home' || (a.v === 'sector' || a.v === 'diary' ? a.sector === b.sector : a.showId === b.showId));
/** Up one level, the same whichever way you arrived: back when you came from there, otherwise straight to it. */
function goUp() {
  const up = parentOf(S.route);
  if (!up) return false;
  closeFind();
  if (history.state && sameRoute(history.state.prev, up)) { history.back(); return 'back'; }
  go(up, true);
  return 'go';
}
window.addEventListener('popstate', (e) => {
  S.route = (e.state && e.state.r) || { v: 'home' };
  S.filter = 'all'; S.q = ''; S.limit = 200;
  closeSheet(); closeFind();
  enter();
  window.scrollTo(0, 0);   // going back shows the screen from its top, not where it was left
});
async function enter() {
  render();
  const r = S.route;
  if (r.v === 'show') {
    const id = r.showId;
    const sh = showById(id);
    if (sh && C.diaryFile(sh.sector)) loadDiary(sh.sector);
    if (!S.rows[id]) S.rows[id] = cachedRows(id);
    if (S.pipe[id] && Date.now() - (S.pipe[id].at || 0) > 60000) loadPipe(id, true);
    updateShow();
    try { await fetchRows(id); } catch (e) { setOffline(e); if (!e.net) toast(e.message); }
    if (S.route.showId !== id) return;
    updateShow();
    ensureChecking();
  } else {
    if (r.v === 'diary') loadDiary(r.sector);
    if (S.api) { await refreshShows(); ensureChecking(); }
  }
}

/* ---------- Rendering: shell ---------- */
function render() {
  renderHeader();
  renderNotices();
  renderMain();
}

function renderHeader() {
  const r = S.route;
  $('#back').hidden = r.v === 'home' || !S.api;
  $('#searchBtn').hidden = !S.api;
  if (!S.api) closeFind();
  let w = { label: '', count: '' };
  if (!S.api) w.label = S.boot === 'signin' ? 'Signed out' : S.boot === 'starting' ? '' : 'Not connected';
  else if (r.v === 'home') w.label = S.shows.length ? C.plural(S.shows.length, 'exhibition') : 'Ready';
  // the sector's exhibitions; an exhibition's own exhibitors, checked or not
  else if (r.v === 'sector') w = C.whereParts('Sector', S.shows.filter((x) => x.sector === r.sector).length, 'exhibition');
  else if (r.v === 'diary') { const d = diaryData(r.sector); w = C.whereParts('Show diary', d ? C.diaryView(d, null, today(), []).total : 0, 'show'); }
  else { const s = showById(r.showId), rows = S.rows[r.showId]; if (s) w = C.whereParts(s.sector, rows && rows.length ? rows.length : (s.counts || {}).total, 'exhibitor'); }
  const html = w.label ? `<span class="wl">${esc(w.label)}</span>${w.count ? `<span class="wn num"><span class="dot">·</span>${esc(w.count)}</span>` : ''}` : '';
  const el = $('#where');
  if (el.innerHTML !== html) el.innerHTML = html;
}

function renderNotices() {
  const out = [];
  if (S.reauth) out.push('<div class="notice"><p>Your HQ sign-in ran out. Sign in again to carry on: nothing is lost.</p><div id="gsiNotice"></div></div>');
  if (S.offline && S.api) out.push(`<div class="notice"><p>${esc(S.offlineMsg || 'Could not reach Exhibitor Leads')}. Showing what was loaded earlier.</p><button class="link-btn" type="button" data-act="retry">Retry</button></div>`);
  if (S.api && !S.offline && C.scriptOutdated(S.build, EXPECT_BUILD)) {
    out.push(`<div class="notice"><p>Your Exhibitor Leads script is out of date (${S.build ? 'release ' + esc(S.build) : 'an older release'}, this page needs ${EXPECT_BUILD}). Paste its new Code.gs and deploy a new version, or the newer checks will not run.</p><button class="link-btn" type="button" data-act="settings">Details</button></div>`);
  }
  if (S.api && !S.offline && S.usage && S.usage.warn && S.usageHidden !== usageKey()) {
    out.push(`<div class="notice"><p>${esc(S.usage.message)}</p><button class="link-btn" type="button" data-act="settings">Details</button><button class="x" type="button" data-act="hide-usage" aria-label="Dismiss">${ICON.x}</button></div>`);
  }
  $('#notices').innerHTML = out.join('');
  if (S.reauth) HQ.button($('#gsiNotice'));
}

function renderMain() {
  const r = S.route;
  $('#main').innerHTML = !S.api ? gateHtml() : r.v === 'sector' ? sectorHtml(r.sector) : r.v === 'diary' ? diaryHtml(r.sector) : r.v === 'show' ? showShellHtml() : homeHtml();
  if (!S.api && S.boot === 'signin') HQ.button($('#gsiSlot'), true);
  if (r.v === 'diary') applyDiaryQ();
  renderHeader();
  if (r.v === 'show') updateShow();
}

/* ---------- Google and Microsoft tiles, and the two bars ---------- */
const LOGO = {
  google: '<img class="logo" src="google.png" alt="" width="16" height="16" decoding="async">',
  microsoft: '<img class="logo" src="microsoft.png" alt="" width="16" height="16" decoding="async">',
};
const logo = (k) => LOGO[k] || '';
/** Before there is anything to count: two empty bars, as a picture of what will come. */
const barsEmpty = () => '<div class="bars-empty" aria-hidden="true"><div class="lbar"><i class="seg pending"></i></div><div class="lbar email"><i class="seg pending"></i></div></div>';

/* ---------- Home ---------- */
function gateHtml() {
  const g = (title, body, extra) => `<section class="gate"><h1 class="empty-title">${title}</h1><p>${body}</p>${extra || ''}</section>`;
  if (S.boot === 'connect') return g('Connect HQ first', 'This page uses Showsum HQ’s own connection and sign-in. Open HQ on this device, connect it, then come back.', '<div class="actions" style="justify-content:center"><a class="btn primary" href="../#/settings">Open Showsum HQ</a></div>');
  if (S.boot === 'signin') return g('Sign in', 'Sign in with the Google account HQ is set up for. Exhibitors are held in memory only while this page is open.', '<div id="gsiSlot"></div>');
  if (S.boot === 'noel') return g('Add Exhibitor Leads to HQ', 'In HQ’s Apps Script, open Project Settings, Script Properties, and add EL_URL: the Exhibitor Leads web app address (it ends in /exec). Then reload this page.', '<div class="actions" style="justify-content:center"><button class="btn primary" type="button" data-act="reboot">Try again</button></div>');
  if (S.boot === 'error') return g('Exhibitors didn’t open', esc(S.bootMsg || 'Something went wrong.'), '<div class="actions" style="justify-content:center"><button class="btn primary" type="button" data-act="reboot">Try again</button><a class="btn" href="../#/overview">Showsum HQ</a></div>');
  return '<section class="gate"><p><span class="spinner" aria-hidden="true"></span>Opening Exhibitors…</p></section>';
}

/** Pipeline rows waiting for your Companies House call, by show: a tap opens the show with just those. */
function checksCardHtml() {
  const list = (S.pipeChecks || []).filter((x) => showById(x.showId));
  if (!list.length) return '';
  return `<h2 class="section-title">Waiting for your Companies House call</h2>${list.map((x) => {
    const sh = showById(x.showId);
    return `<div class="item checks-card"><button class="item-main" type="button" data-act="open-checks" data-id="${esc(sh.id)}"><span><span class="item-name long">${esc(sh.name)}</span><span class="item-sub num">${esc(C.plural(x.n, 'business', 'businesses'))} the pipeline won’t email until you decide</span></span>${ICON.chev}</button></div>`;
  }).join('')}`;
}

function homeHtml() {
  if (!S.api) return gateHtml();
  const t = totals(), sectors = C.sectorsFrom(S.shows);
  const has = S.shows.length > 0;
  const head = { n: String(S.shows.length), text: `${S.shows.length === 1 ? 'exhibition' : 'exhibitions'} in ${C.plural(sectors.length, 'sector')}` };
  return `<section class="hero" id="homeHero">${t.total ? '' : barsEmpty()}
      <h1 class="empty-title">${has ? 'Your leads' : 'Who are you selling to?'}</h1>
      ${has ? leadsHtml(head, t, 'No exhibitors loaded yet.', E.running && E.showId === '*' && !E.stop) : `<p class="empty-body">Tap the search icon, or the button below, and choose a sector such as baby, whisky or crafts. You get searches to find the shows, then Exhibitor Leads reads each exhibitor list for you.</p>
      <div class="actions"><button class="btn primary" type="button" data-act="open-search">Find shows</button></div>`}
    </section>
    ${checksCardHtml()}
    ${sectors.length ? `<h2 class="section-title">Your sectors</h2>${sectors.map(sectorRow).join('')}` : ''}`;
}

/**
 * "Your leads": the counts, then two groups, each a bar with its own lines underneath in the same colours and order:
 * "Can you email them?" and "Who runs their email?". Falls back to a sentence while there is nothing to count.
 */
function leadsHtml(head, c, fallback, running) {
  const li = (l) => `<li><i class="lk${l.k ? ' ' + l.k : ''}" aria-hidden="true">${logo(l.k)}</i><span>${l.n ? `<strong class="num">${esc(l.n)}</strong>${l.pct ? ` <span class="pct">(${esc(l.pct)})</span>` : ''} ` : ''}${esc(l.text)}</span></li>`;
  const g = C.leadGroups(c);
  if (!g && !head) return `<p class="story">${esc(fallback)}</p>`;
  const total = g ? g.status.bar.reduce((a, x) => a + x.n, 0) : 0;
  const group = (title, kind, grp) => `<div class="lgroup ${kind}"><h3 class="lgroup-h">${title}</h3>
    <div class="lbar ${kind}" role="img" aria-label="${esc(C.barLabel(title.replace(/\?$/, ''), grp.bar))}">${grp.bar.map((x) => `<i class="seg ${x.k}" style="flex-grow:${x.n}">${kind === 'email' && x.n / total >= 0.07 ? logo(x.k) : ''}</i>`).join('')}</div>
    <ul class="leads">${grp.lines.map(li).join('')}</ul></div>`;
  return `<ul class="leads">${head ? li(head) : ''}${g ? topLine(g.head, running) : li({ n: '', text: fallback })}</ul>`
    + (g ? group('Can you email them?', 'status', g.status) + (g.email ? group('Who runs their email?', 'email', g.email) : '') : '');
}

function sectorRow(s) {
  const bits = [C.plural(s.shows, 'exhibition')];
  if (s.total) bits.push(C.plural(s.total, 'exhibitor'));
  if (s.corporate) bits.push(`${s.corporate} can email`);
  return `<div class="item"><button class="item-main" type="button" data-sector="${esc(s.name)}"><span><span class="item-name long">${esc(s.name)}</span><span class="item-sub num">${esc(bits.join(', '))}</span></span>${ICON.chev}</button></div>`;
}

/* ---------- Sector ---------- */
function sectorHtml(sector) {
  const shows = S.shows.filter((s) => s.sector === sector);
  const t = { total: 0, done: 0, corporate: 0, consent: 0, check: 0, google: 0, microsoft: 0, pending: 0 };
  shows.forEach((s) => { const c = s.counts || {}; Object.keys(t).forEach((k) => { t[k] += c[k] || 0; }); });
  const links = C.searchLinks(sector);
  const groups = C.groupShows(shows, today());
  return `<section class="hero">${t.total ? '' : barsEmpty()}
      <div class="title-row"><h1 class="sat-name">${esc(sector)}</h1>
        <div class="row-icons">
          <button class="ico-btn main" type="button" data-act="add-show" aria-label="Add exhibition" title="Add exhibition">${ICON.plus}</button>
          ${C.diaryFile(sector) ? `<button class="ico-btn" type="button" data-act="diary" aria-label="Show diary" title="Show diary">${ICON.calendar}</button>` : ''}
          ${shows.length ? `<button class="ico-btn" type="button" data-act="rename-sector" aria-label="Rename sector" title="Rename sector">${ICON.pencil}</button>` : ''}
          ${t.total ? `<button class="ico-btn" type="button" data-act="sector-csv" aria-label="Download CSV" title="Download CSV">${ICON.down}</button>` : ''}
        </div></div>
      ${shows.length ? leadsHtml({ n: String(shows.length), text: shows.length === 1 ? 'exhibition' : 'exhibitions' }, t, 'No exhibitors loaded yet.', E.running && E.showId === '*' && !E.stop) : '<p class="empty-body">No exhibitions yet. Run one of the searches below, open a show’s exhibitor list, then add it here.</p>'}
    </section>
    ${shows.length ? groups.map((g) => `<h2 class="day">${esc(g.label)}</h2>${g.shows.map(showRow).join('')}`).join('') + finderHtml(sector, links) : finderHtml(sector, links)}`;
}

/**
 * "Find exhibitions": how a show gets into the app (browse, open its own site, share), the listings pages for this sector and
 * the ones you saved, then the Google searches. Everything opens in Chrome; the app never reads these sites itself.
 */
function finderHtml(sector, links) {
  const pages = C.finderPages(sector, (S.searches || {})[String(sector).toLowerCase()]);
  const row = (p) => `<div class="src"><a class="src-main" href="${esc(p.url)}" target="_blank" rel="noopener" data-chrome>
      <span class="tile${p.mine ? ' mine' : ''}" aria-hidden="true">${esc(p.tile)}</span>
      <span class="src-txt"><span class="src-name">${esc(p.name)}</span><span class="src-sub">${esc(p.sub)}</span></span>${ICON.ext}</a>
      ${p.mine ? `<button class="src-x" type="button" data-act="remove-search" data-url="${esc(p.url)}" aria-label="Remove ${esc(p.name)}" title="Remove">${ICON.x}</button>` : ''}</div>`;
  const g = (l) => `<div class="src"><a class="src-main" href="${esc(l.url)}" target="_blank" rel="noopener" data-chrome>
      <span class="tile g" aria-hidden="true">${logo('google')}</span>
      <span class="src-txt"><span class="src-name">${esc(l.label)}</span><span class="src-sub">${esc(C.searchText(l.url))}</span></span>${ICON.ext}</a></div>`;
  return `<section class="finder" aria-labelledby="finderH">
      <div class="finder-head"><h2 class="section-title" id="finderH">Find exhibitions</h2>
        <button class="ico-btn main" type="button" data-act="add-search" aria-label="Save a search page" title="Save a search page">${ICON.plus}</button></div>
      <ol class="how" aria-label="How to add a show">
        <li><span class="hi">${ICON.browse}</span>Browse a listing</li>
        <li><span class="hi">${ICON.globe}</span>Open the show’s own site</li>
        <li><span class="hi">${ICON.share}</span>Share it to Exhibitor Leads</li>
      </ol>
      <h3 class="finder-sub">Listings <span>open in Chrome</span></h3>
      <div class="src-group">${pages.map(row).join('')}</div>
      <h3 class="finder-sub">Google searches</h3>
      <div class="src-group">${links.map(g).join('')}</div>
      <p class="section-note" style="margin-top:10px">The app never reads these pages: listings sites ask that only people browse them. It reads a show’s own website once you share it.</p>
    </section>`;
}

/* ---------- Show diary ---------- */
// A file in the app (diary-baby.json, diary-crafts.json, diary-christmas.json) of shows researched for a sector. Read once a session, kept on the phone for offline.
const DIARY_MARK = { organiser: ICON.tick, listing: ICON.warn, tbc: ICON.later };
/** The diary for a sector: this session's copy, or the one kept on the phone. */
function diaryData(sector) {
  const file = C.diaryFile(sector);
  if (!file) return null;
  if (!S.diaries[file]) { const kept = get('diary.' + file, null); if (kept && Array.isArray(kept.shows)) S.diaries[file] = kept; }
  return S.diaries[file] || null;
}
function diaryEntry(i) { const d = diaryData(S.route.sector); return d ? d.shows[+i] || null : null; }
/** Reads the diary file (the newest one the app has), shows it if it changed, and keeps it for offline. */
async function loadDiary(sector) {
  const file = C.diaryFile(sector);
  if (!file) return;
  const was = JSON.stringify(diaryData(sector));
  const here = () => S.route.v === 'diary' && C.diaryFile(S.route.sector) === file;
  try {
    const r = await fetch(file, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || !Array.isArray(j.shows)) throw new Error('not a diary');
    S.diaries[file] = j; put('diary.' + file, j); S.diaryFail = false;
    if (was !== JSON.stringify(j) && here()) renderMain();
    else if (was !== JSON.stringify(j) && S.route.v === 'show') { const h = $('#showHero'); if (h) h.dataset.key = ''; updateShow(); }
  } catch (e) {
    if (!S.diaries[file]) { S.diaryFail = true; if (here()) renderMain(); }
  }
}

/**
 * The Show diary for a sector: the type chips, a key to the date marks, then the shows still to come by month. Each has its map pin,
 * website and exhibitor list, and a plus that starts Add exhibition already filled in, or a tick once it is one of your exhibitions.
 */
function diaryHtml(sector) {
  const d = diaryData(sector);
  const top = (about, body) => `<section class="hero"><div class="title-row"><div><h1 class="sat-name">Show diary</h1>
      <p class="when">${esc(about)}</p></div></div>${body}</section>`;
  if (!d) {
    return top(`Shows to research for ${sector}`, S.diaryFail ? '<p class="empty-body">The show diary could not load. Check your connection, then go back and open it again.</p>'
      : '<p class="empty-body"><span class="spinner" aria-hidden="true"></span>Opening the show diary…</p>');
  }
  let v = C.diaryView(d, { type: S.diaryType }, today(), S.shows);
  if (S.diaryType !== 'all' && !v.counts[S.diaryType]) { S.diaryType = 'all'; v = C.diaryView(d, { type: 'all' }, today(), S.shows); }
  const chip = (id, label) => `<button class="chip" type="button" data-act="diary-type" data-type="${id}" aria-pressed="${S.diaryType === id}">${esc(label)} <span class="n num">${v.counts[id]}</span></button>`;
  const chips = chip('all', 'All') + C.diaryTypes(d).filter((t) => v.counts[t.id]).map((t) => chip(t.id, t.label)).join('');
  const key = Object.keys(C.DIARY_DATES).map((k) => `<span class="dy-st ${k}" title="${esc(C.DIARY_DATES[k].help)}">${DIARY_MARK[k]}${esc(C.DIARY_DATES[k].label)}</span>`).join('');
  const list = v.groups.length ? v.groups.map((g) => `<h2 class="day">${esc(g.label)}</h2>${g.items.map(diaryRow).join('')}`).join('')
    : '<p class="empty-list">No shows still to come in this diary. It is updated with each release.</p>';
  return top(d.about || `Shows to research for ${sector}`, `<p class="dy-key" aria-label="What the date marks mean">${key}</p>`)
    + `<div class="chips filters" role="group" aria-label="Type of show">${chips}</div>
    <form class="quiet-search" id="diaryFind" role="search"><input class="field" id="dq" type="search" placeholder="${esc(d.searchHint || 'Search this diary: a show, town or craft')}" autocomplete="off" enterkeyhint="search" aria-label="Search this diary" value="${esc(S.diaryQ || '')}"></form>
    <div id="diaryList">${list}<p class="empty-list" id="dqNone" hidden>No shows match. Clear the search or choose All.</p></div>
    <p class="foot">${esc(C.diaryChecked(d.checked))}. Dates change, so confirm on the show’s own site before booking. Tap a date mark to see where it came from.</p>`;
}

/* ---------- Attendance ---------- */
const ATT_ICON = { counted: ICON.tick, claim: ICON.warn, estimate: ICON.approx, none: ICON.dash };
const attMarkHtml = (k) => { k = C.ATT_MARKS[k] ? k : 'none'; return `<span class="att-m ${k}" title="${esc(C.ATT_MARKS[k].help)}">${ATT_ICON[k]}${esc(C.ATT_MARKS[k].label)}</span>`; };
/** "23,224 visitors in 2022 · ✓ Counted · Next: 22,000–26,000" as one button that opens the Attendance popup. Nothing when not researched. */
function attLine(att, data) {
  const h = C.attHeadline(att);
  if (!h) return '';
  const what = h.mark === 'none' ? (h.text === 'Not published' ? 'Visitors not published' : 'No recent visitor figures') : h.mark === 'estimate' ? `About ${h.text}` : `${h.text}${h.year ? ` in ${h.year}` : ''}`;
  return `<button class="att-line" type="button" ${data} aria-label="Attendance: ${esc(what)}${h.next ? '. ' + esc(h.next) : ''}">${ICON.people}
    <span class="att-t"><span class="att-n num">${esc(what)}</span> ${attMarkHtml(h.mark)}${h.next ? ` <span class="att-next num">${esc(h.next)}</span>` : ''}</span>${ICON.chev}</button>`;
}
/** Every figure published for a show, how each was got, the estimate for the next show and how it was worked out. */
function openAttendance(entry) {
  const a = entry && entry.attendance;
  if (!a) return;
  const figs = C.attFigures(a), est = a.estimate;
  const title = [entry.name, entry.edition].filter(Boolean).join(' · ');
  const key = Object.keys(C.ATT_MARKS).map((k) => `<div>${attMarkHtml(k)}<span>${esc(C.ATT_MARKS[k].help)}</span></div>`).join('');
  const fig = (f) => `<li class="att-f">
      <div class="att-fh">${attMarkHtml(f.mark)}<span class="num">${esc(String(f.year || ''))}</span>${f.shown ? `<b class="num">${esc(f.shown)}</b>` : '<span class="att-words">in words only</span>'}</div>
      ${f.text ? `<p class="att-q">“${esc(f.text)}”</p>` : ''}
      ${f.source ? `<a class="att-src" href="${esc(f.source)}" target="_blank" rel="noopener" data-chrome="1">${esc(f.sourceName || 'Source')}${ICON.ext}</a>` : ''}</li>`;
  openSheet(`${head('Attendance')}
    <p class="att-show">${esc(title)}</p>
    ${est && est.low ? `<h3 class="finder-sub">Next show</h3><div class="att-est"><b class="num">${esc(C.attRangeText(est))}</b> ${attMarkHtml('estimate')}<p>${esc(est.how || '')}</p></div>` : ''}
    <h3 class="finder-sub">Published figures</h3>
    ${figs.length ? `<ul class="att-list">${figs.map(fig).join('')}</ul>` : `<p class="att-none">${attMarkHtml('none')}</p>`}
    ${a.note ? `<p class="att-note">${esc(a.note)}</p>` : ''}
    <div class="att-key">${key}</div>
    <p class="hint">Guidance, not fact. Organisers count in different ways: some count visits rather than people, some include exhibitors, and few are audited.${a.checked ? ` Checked ${esc(C.fmtDates(a.checked))}.` : ''}</p>`);
}

/** Shows only the rows with every word typed (name, town, venue, kind of show, who exhibits), and the months that still have one. */
function applyDiaryQ() {
  const box = $('#diaryList');
  if (!box) return;
  const words = C.plainText(S.diaryQ || '').split(' ').filter(Boolean);
  let shown = 0, head = null, inHead = 0;
  const close = () => { if (head) head.hidden = inHead === 0; };
  for (const el of box.children) {
    if (el.matches('h2.day')) { close(); head = el; inHead = 0; continue; }
    if (!el.classList.contains('dy')) continue;
    const ok = words.every((w) => el.dataset.q.indexOf(w) >= 0);
    el.hidden = !ok; if (ok) { shown++; inHead++; }
  }
  close();
  $('#dqNone').hidden = shown > 0 || !box.querySelector('.dy');
}

function diaryRow(e) {
  const type = C.diaryTypes(diaryData(S.route.sector)).find((t) => t.id === e.type);
  const mark = C.DIARY_DATES[e.dates] ? e.dates : 'tbc';
  const name = C.diaryName(e);
  const icons = [];
  if (!e.series && e.venue) icons.push(`<a class="ico-btn" href="${esc(C.mapsUrl(e.venue))}" target="_blank" rel="noopener" aria-label="Open ${esc(e.venue)} in Google Maps" title="Open the venue in Google Maps">${ICON.pin}</a>`);
  if (e.site) icons.push(`<a class="ico-btn" href="${esc(e.site)}" target="_blank" rel="noopener" data-chrome="1" aria-label="${esc(name)} website" title="Website">${ICON.globe}</a>`);
  if (e.list) icons.push(`<a class="ico-btn" href="${esc(e.list)}" target="_blank" rel="noopener" data-chrome="1" aria-label="${esc(name)} ${esc(e.listLabel || 'exhibitor list')}" title="${esc(e.listLabel || 'Exhibitor list')}">${ICON.exhibitors}</a>`);
  if (e.added) icons.push(`<button class="ico-btn ok" type="button" data-show="${esc(e.added.id)}" aria-label="In your exhibitions: open ${esc(e.added.name)}" title="In your exhibitions">${ICON.tick}</button>`);
  else if (!e.series) icons.push(`<button class="ico-btn main" type="button" data-act="diary-add" data-i="${e.i}" aria-label="Add ${esc(name)} to your exhibitions" title="Add to your exhibitions">${ICON.plus}</button>`);
  const label = `${DIARY_MARK[mark]}${esc(C.DIARY_DATES[mark].label)}`;
  const st = e.source ? `<a class="dy-st ${mark}" href="${esc(e.source)}" target="_blank" rel="noopener" data-chrome="1" title="${esc(C.DIARY_DATES[mark].help)}. Source: ${esc(e.sourceName || '')}">${label}</a>`
    : `<span class="dy-st ${mark}" title="${esc(C.DIARY_DATES[mark].help)}">${label}</span>`;
  const words = [e.name, e.edition, e.venue, e.region, e.who, type && type.one, e.start ? C.fmtDates(e.start, e.end) : e.when].filter(Boolean).join(' ');
  return `<div class="dy" data-q="${esc(C.plainText(words))}">
      ${type ? `<p class="dy-type">${esc(type.one)}</p>` : ''}
      <p class="dy-name">${esc(e.name)}${e.edition ? ` <span>· ${esc(e.edition)}</span>` : ''}</p>
      <p class="dy-when num">${e.phase === 'live' ? '<b>On now</b> · ' : ''}${esc(e.start ? C.fmtDates(e.start, e.end) : e.when || 'Dates not out yet')}</p>
      ${e.venue ? `<p class="dy-venue">${esc(e.venue)}</p>` : ''}
      ${attLine(e.attendance, `data-act="attendance" data-i="${e.i}"`)}
      ${e.who ? `<p class="dy-who">${esc(e.who)}</p>` : ''}
      ${e.note ? `<p class="dy-note">${esc(e.note)}</p>` : ''}
      <div class="dy-foot">${st}<span class="dy-ico">${icons.join('')}</span></div>
    </div>`;
}

/** Saves a filtered listings page under a sector, from Find exhibitions or from a listings page shared to the app. */
function openAddSearch(sector, pre) {
  pre = pre || {};
  const sectors = C.sectorOptions(S.shows).map((o) => o.name);
  openSheet(`${head(pre.shared ? 'A listings page' : 'Save a search page')}
    <p>${pre.shared ? `${esc(pre.host || 'This')} is a listings site, so Exhibitor Leads does not read it. From it, open the show’s own website and share that. Or keep this page here to browse again.`
      : 'Set the filters you like on a listings site in Chrome, copy the page address, and paste it here. It appears under Find exhibitions.'}</p>
    <form id="searchForm" novalidate>
      <label class="lbl" for="ss-url" style="margin-top:6px">Page address</label>
      <input class="field" id="ss-url" name="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://www.cantonfair.net/…" value="${esc(pre.url || '')}">
      <label class="lbl" for="ss-label">Name</label>
      <input class="field" id="ss-label" name="label" maxlength="60" autocomplete="off" placeholder="For example cantonfair, England + baby" value="${esc(pre.label || '')}">
      <label class="lbl" for="ss-sector">Sector</label>
      <input class="field" id="ss-sector" name="sector" list="ssList" maxlength="40" autocomplete="off" value="${esc(sector || '')}">
      <datalist id="ssList">${sectors.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <div class="actions"><button class="btn primary" type="submit">Save search page</button>${pre.shared ? '<button class="btn" type="button" data-act="add-show-blank">Add an exhibition</button>' : '<button class="btn" type="button" data-act="close">Cancel</button>'}</div>
    </form>`);
}

function showRow(s) {
  const c = s.counts || {};
  let sub;
  if (!c.total) sub = s.status === 'loaded' ? 'No exhibitors found' : s.status === 'blocked' || s.status === 'empty' || s.status === 'error' ? 'Needs a pasted list' : 'Not loaded yet';
  else if (c.pending) sub = `Checking ${c.done} of ${c.total}`;
  else sub = `${C.plural(c.total, 'exhibitor')}, ${c.corporate} can email`;
  return `<div class="item"><button class="item-main" type="button" data-show="${esc(s.id)}"><span><span class="item-name long">${esc(s.name)}</span><span class="item-sub num">${esc(C.fmtDates(s.start, s.end))}</span><span class="item-sub num">${esc(sub)}</span></span>${ICON.chev}</button></div>`;
}

/* ---------- Show ---------- */
function showShellHtml() {
  const s = showById(S.route.showId);
  if (!s) return `<section class="hero"><h1 class="empty-title">Exhibition not found</h1><p class="empty-body">It may have been deleted. Go back and choose another.</p></section>`;
  return `<section class="hero" id="showHero"></section>
    <div id="showPipe"></div>
    <div id="showFilters"></div>
    <div id="showRows"></div>`;
}

function showActions(s, c) {
  if (!c.total) {
    const bad = s.status === 'blocked' || s.status === 'empty' || s.status === 'error';
    if (s.urls.length && !bad) return `<button class="btn primary" type="button" data-act="load">Load exhibitor list</button><button class="btn" type="button" data-act="paste">Paste a list</button>`;
    return `<button class="btn primary" type="button" data-act="paste">Paste the list</button>${!s.urls.length ? '<button class="btn" type="button" data-act="edit-show">Add a link</button>' : s.status === 'blocked' ? '<button class="btn" type="button" data-act="edit-show">Change the link</button>' : '<button class="btn" type="button" data-act="load">Try the link again</button>'}`;
  }
  return '';   // checking, pausing and carrying on are the round button on the top line
}

function updateShow() {
  if (S.route.v !== 'show') return;
  const s = showById(S.route.showId), hero = $('#showHero');
  if (!s || !hero) return;
  const rows = S.rows[s.id] || [];
  const c = rows.length ? C.countRows(rows) : (s.counts || C.countRows([]));
  const group = C.GROUPS.find((g) => g.id === C.showGroup(s, today()));
  const running = E.running && E.showId === s.id && !E.stop;
  renderHeader();
  const actions = showActions(s, c);
  const dEntry = showDiaryEntry(s);
  const key = [s.id, s.name, s.start, s.end, s.venue, c.total, c.done, c.corporate, c.check, c.consent, c.google, c.microsoft, running, s.status, s.statusNote, s.urls.length,
    s.organiser, s.contactName, s.contactRole, s.contactEmail, s.contactPhone, s.contactPage, dEntry ? JSON.stringify(C.attHeadline(dEntry.attendance)) : ''].join('|');
  if (hero.dataset.key !== key) {
    hero.dataset.key = key;
    hero.innerHTML = `${c.total ? '' : barsEmpty()}
      <div class="title-row"><div><h1 class="sat-name">${esc(s.name)}</h1><p class="when num">${esc(group.id === 'undated' ? 'Dates not set' : `${C.fmtDates(s.start, s.end)}, ${group.label.toLowerCase()}`)}</p>${s.venue ? `<p class="venue">${esc(s.venue)}</p>` : ''}</div>
      <div class="row-icons"><a class="ico-btn" href="${esc(C.mapsUrl(s.venue || s.name))}" target="_blank" rel="noopener" aria-label="${esc(s.venue ? 'Open ' + s.venue + ' in Google Maps' : 'Find this exhibition in Google Maps')}" title="${s.venue ? 'Open the venue in Google Maps' : 'Find it in Google Maps'}">${ICON.pin}</a>${c.total ? `<button class="ico-btn" type="button" data-act="csv" aria-label="Download CSV" title="Download CSV">${ICON.down}</button>` : ''}<button class="ico-btn" type="button" data-act="show-menu" aria-label="Exhibition options" title="Exhibition options">${ICON.more}</button></div></div>
      ${dEntry ? attLine(dEntry.attendance, 'data-act="attendance" data-i="show"') : ''}
      ${organiserHtml(s)}
      ${leadsHtml(null, c, C.summary(c, s), running)}
      ${actions ? `<div class="actions">${actions}</div>` : ''}`;
  }
  updatePipe(s, rows);
  const f = $('#showFilters');
  if (!c.total) { f.innerHTML = ''; $('#showRows').innerHTML = ''; return; }
  if (!f.dataset.ready) {
    f.dataset.ready = '1';
    f.innerHTML = `<div class="chips filters" id="chipRow" role="group" aria-label="Filter exhibitors"></div>
      <form class="quiet-search" id="searchForm" role="search"><input class="field" id="q" type="search" placeholder="Search this list" autocomplete="off" enterkeyhint="search" aria-label="Search this list" value="${esc(S.q)}"></form>`;
  }
  const pc = pipeCounts(s.id, rows);
  $('#chipRow').innerHTML = C.FILTERS.filter((x) => x.id === 'all' || x.id === S.filter || C.filterCount(c, x.id) > 0)
    .map((x) => `<button class="chip${x.id === 'corporate' ? ' st st-ok' : x.id === 'check' ? ' st st-check' : x.id === 'consent' ? ' st st-consent' : ''}" type="button" data-filter="${x.id}" aria-pressed="${S.filter === x.id}">${logo(x.id)}${esc(x.label)} <span class="n num">${C.filterCount(c, x.id)}</span></button>`).join('')
    + PIPE_FILTERS.filter((x) => x.id === S.filter || (pc && pc[x.id] > 0))
      .map((x) => `<button class="chip" type="button" data-filter="${x.id}" aria-pressed="${S.filter === x.id}">${esc(x.label)} <span class="n num">${pc ? pc[x.id] : '…'}</span></button>`).join('');
  const pipeF = /^pipe-/.test(S.filter);
  let list = C.filterRows(rows, { filter: pipeF ? 'all' : S.filter, q: S.q });
  if (pipeF) list = list.filter((r) => pipeIs(r, S.filter));
  const shown = list.slice(0, S.limit);
  const none = pipeF && !pipeData(s.id) ? '<p class="empty-list"><span class="spinner" aria-hidden="true"></span>Reading the pipeline…</p>' : '<p class="empty-list">No exhibitors match. Clear the search or choose All.</p>';
  $('#showRows').innerHTML = (shown.length ? shown.map(rowHtml).join('') : none)
    + (list.length > shown.length ? `<button class="more-btn" type="button" data-act="more">Show ${Math.min(200, list.length - shown.length)} more of ${list.length - shown.length}</button>` : '');
}

function rowHtml(r) {
  const st = C.statusOf(r);
  const who = [r.contact, r.domain].filter(Boolean).join(', ');
  const n = C.listedCount(r);
  const badge = n >= 2 ? `<span class="ex-badge" role="img" aria-label="In ${n} exhibitions" title="In ${n} exhibitions">${ICON.stack}${n}</span>` : '';
  return `<div class="ex"><button class="ex-main${badge ? ' has-badge' : ''}" type="button" data-row="${esc(r.id)}"><span class="dot ${st}"></span>
    <span class="ex-t"><span class="ex-name">${esc(r.name)}${pipeChips(r)}</span><span class="ex-sub">${C.rowParts(r).map((b) => logo(b.logo) + esc(b.text)).join(', ')}</span>${who ? `<span class="ex-sub dim">${esc(who)}</span>` : ''}</span>${badge}${ICON.chev}</button></div>`;
}

/* ---------- The pipeline: what each exhibitor is in Showsum, Go, the fast lane and your Companies House calls ----------
 * From the HQ script (it reads the pipeline sheet, and runs Go through the pipeline's web app). Held in memory only. */
const PIPE_FILTERS = [
  { id: 'pipe-in', label: 'In pipeline' },
  { id: 'pipe-check', label: 'Pipeline: your call' },
  { id: 'pipe-out', label: 'Not in pipeline' },
];
const pipeData = (id) => (S.pipe[id] && S.pipe[id].data) || null;
const pipeRow = (r) => { const d = pipeData(r.showId); return d && d.rows && Object.prototype.hasOwnProperty.call(d.rows, r.id) ? d.rows[r.id] : null; };
const needsCall = (pr) => !!pr && pr.can === 'Check' && !pr.touches;
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
  (rows || []).forEach((r) => { PIPE_FILTERS.forEach((x) => { if (pipeIs(r, x.id)) n[x.id]++; }); });
  return n;
}
function pipeChips(r) {
  const pr = pipeRow(r);
  if (!pr) return '';
  const what = pr.touches ? (pr.touches === 1 ? 'Emailed' : `Emailed ×${pr.touches}`) : needsCall(pr) ? 'Your call' : pr.stage;
  return `<span class="pchip${needsCall(pr) ? ' check' : ''}" title="In the pipeline: ${esc(pr.code)}">${esc([pr.priority, what].filter(Boolean).join(' · '))}</span>${pr.batch ? `<span class="pchip batch" title="In batch ${esc(pr.batch)}">${esc(pr.batch)}</span>` : ''}`;
}

/** Reads the pipeline's side of a show (a read already on its way is shared). Quiet: no spinner while it looks again. */
function loadPipe(id, quiet) {
  const was = S.pipe[id] || {};
  if (was.loading) return was.loading;
  const run = (async () => {
    try {
      const j = await HQ.call('pipelineFor', { showId: id }, 60000);
      S.pipe[id] = { data: j, at: Date.now() };
    } catch (e) {
      S.pipe[id] = { data: was.data || null, at: was.at || 0, err: e.message };
    }
    if (S.route.v === 'show' && S.route.showId === id) updateShow();
  })();
  S.pipe[id] = Object.assign({}, was, { loading: run, err: '' });
  if (!quiet) updateShow();
  return run;
}
/** The pipeline rows waiting for your Companies House call, for the home screen. */
async function loadChecks() {
  try { S.pipeChecks = (await HQ.call('pipelineChecks', null, 60000)).checks || []; } catch (e) { return; }
  if (S.route.v === 'home') renderMain();
}

const STEP_WORDS = { first: 'First email', day2: 'Day 2', last: 'Last touch', season: 'Season planning' };
function pipeHtml(s, rows) {
  const p = S.pipe[s.id] || {}, d = p.data;
  const top = `<div class="pipe-h"><h2>In the pipeline</h2><span class="eyebrow">Showsum</span></div>`;
  if (!d) {
    if (p.err) return `${top}<p>${esc(p.err)}</p><div class="actions"><button class="btn" type="button" data-act="pipe-retry">Try again</button></div>`;
    return `${top}<p><span class="spinner" aria-hidden="true"></span>Reading the pipeline…</p>`;
  }
  const c = d.counts || {}, out = [];
  const pc = pipeCounts(s.id, rows) || {};
  const pending = (rows || []).filter((r) => C.statusOf(r) === 'pending').length;
  if (c.imported) {
    out.push(`<p><b class="num">${esc(c.imported)}</b> in the pipeline · <b class="num">${esc(c.emailed)}</b> emailed · <b class="num">${esc(c.canEmail)}</b> can email</p>`);
    if (c.check) out.push(`<p>${esc(C.plural(c.check, 'business', 'businesses'))} waiting for your Companies House call before any email.</p>`);
  } else out.push('<p>Not in the pipeline yet. Go brings in the exhibitors checked here, with the pipeline’s own rules.</p>');
  if (c.imported && pc['pipe-out']) out.push(`<p>${esc(C.plural(pc['pipe-out'], 'checked exhibitor'))} not in the pipeline: Go brings them in where its rules allow (other sectors, opt-outs and duplicates stay out).</p>`);
  if (pending) out.push(`<p>${esc(C.plural(pending, 'exhibitor'))} still being checked here. Go leaves them for next time.</p>`);
  if (d.show) out.push(`<p>${d.show.attending ? `You’re going${d.show.visitDay ? ': ' + esc(d.show.visitDay) : ''}` : 'Not marked as going'}${d.show.page ? ` · emails link to /showsum/${esc(d.show.page)}/` : ''}</p>`);
  const bl = (d.batches || []).map((b) => `<a href="../#/overview" title="Open the departures board in HQ">${esc(b.id)} · ${esc(STEP_WORDS[b.stage] || b.stage || '')} · ${esc(b.status)} · ${esc(b.members)}</a>`);
  if (bl.length) out.push(`<div class="bl">${bl.join('')}</div>`);
  if (d.firstReady) out.push(`<p>${esc(C.plural(d.firstReady, 'business', 'businesses'))} due a first email and not in a batch yet${d.fastReady ? `, ${esc(d.fastReady)} of them P1 or P2` : ''}.</p>`);
  const acts = [];
  if (d.pipelineReady) acts.push(`<button class="btn primary" type="button" data-act="go">${c.imported ? 'Go again' : 'Go'}</button>`);
  if (pc['pipe-check']) acts.push(`<button class="btn" type="button" data-filter="pipe-check">Show the ${esc(pc['pipe-check'])} to decide</button>`);
  acts.push('<a class="btn" href="../#/overview">Batches in HQ</a>');
  if (!d.pipelineReady) out.push('<p class="hint">To use Go, add PIPELINE_URL and SHEET_SECRET to HQ’s Script Properties (HQ Settings says how).</p>');
  if (p.err) out.push(`<p class="hint">Couldn’t look again just now: ${esc(p.err)}</p>`);
  return `${top}${out.join('')}<div class="actions">${acts.join('')}</div>`;
}
function updatePipe(s, rows) {
  const box = $('#showPipe');
  if (!box) return;
  const p = S.pipe[s.id];
  if (!p) { loadPipe(s.id, true); }
  const html = `<section class="pipe" aria-label="In the pipeline">${pipeHtml(s, rows)}</section>`;
  if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
}

/** The row's own pipeline section, with your Companies House call when the pipeline is waiting for one. */
function pipeRowHtml(r) {
  const d = pipeData(r.showId), pr = pipeRow(r);
  if (!d) return `<h3>In the pipeline</h3><p class="small">${(S.pipe[r.showId] || {}).err ? esc(S.pipe[r.showId].err) : 'Reading the pipeline…'}</p>`;
  if (!pr) return `<h3>In the pipeline</h3><p class="small">Not in the pipeline. ${C.statusOf(r) === 'pending' ? 'Once it is checked here, Go brings it in.' : 'Go brings it in, if the pipeline’s rules allow.'}</p>`;
  return `<h3>In the pipeline</h3>
    ${kv('Code', esc(pr.code))}
    ${kv('Stage', esc(pr.stage), pr.touches ? C.plural(pr.touches, 'email') + ' sent' : 'Not emailed yet')}
    ${kv('Can email', esc(pr.can), pr.priority ? 'Priority ' + pr.priority : '')}
    ${pr.why ? kv('Next', esc(pr.why), pr.due ? 'Due ' + C.fmtDates(pr.due) : '') : ''}
    ${pr.batch ? kv('Batch', esc(pr.batch)) : ''}
    ${needsCall(pr) ? `<p class="hint">The pipeline won’t email them until you decide. A limited company can be emailed; a sole trader or partnership needs consent first.</p>
      <div class="actions"><button class="btn primary" type="button" data-act="pipe-yes" data-id="${esc(r.id)}">Yes (Ltd): can email</button><button class="btn" type="button" data-act="pipe-consent" data-id="${esc(r.id)}">Consent needed</button></div>` : ''}
    ${pr.can === 'Yes (Ltd)' ? `<div class="actions"><button class="btn" type="button" data-act="pipe-down" data-id="${esc(r.id)}">Not a limited company? Consent needed</button></div>` : ''}`;
}

/**
 * Your call, made in the pipeline, on a row not yet emailed: from "Check" to Yes (Ltd) or Consent needed, or from Yes (Ltd)
 * to Consent needed or Check. The pipeline refuses if the row no longer says what this page saw. Then it's read again.
 */
async function setCanEmail(r, value, expect, quiet) {
  const pr = pipeRow(r);
  if (!pr || pr.can !== expect || (value === 'Yes (Ltd)' && pr.touches)) return false;
  const j = await HQ.call('setCanEmail', { code: pr.code, value, expect }, 60000);
  const ce = j.canEmail || {};
  pr.can = value; if (ce.priority) pr.priority = ce.priority;
  const d = pipeData(r.showId), bucket = (v) => (v === 'Yes (Ltd)' ? 'canEmail' : v === 'Check' ? 'check' : 'consent');
  if (d && d.counts) { d.counts[bucket(expect)] = Math.max(0, (d.counts[bucket(expect)] || 0) - 1); d.counts[bucket(value)] = (d.counts[bucket(value)] || 0) + 1; }
  if (S.pipeChecks && expect === 'Check') S.pipeChecks = S.pipeChecks.map((x) => (x.showId === r.showId ? Object.assign({}, x, { n: x.n - 1 }) : x)).filter((x) => x.n > 0);
  const also = j.twins ? ` (and ${C.plural(j.twins, 'other row')} of the same business)` : '';
  if (!quiet) toast((value === 'Yes (Ltd)' ? `${r.name}: the pipeline can email them now (${ce.priority || pr.priority || 'Yes (Ltd)'})` : value === 'Check' ? `${r.name}: held as Check, so no emails until you decide` : `${r.name}: consent needed, so no cold emails`) + also);
  loadPipe(r.showId, true);
  return also || true;
}
/**
 * After you decide a company here (Yes, same company; No, a different one; or a company number), the pipeline row
 * follows, read fresh first: a "Check" row not yet emailed becomes Yes (Ltd) once the company makes it emailable; a row
 * you've said isn't an emailable company becomes Consent needed (or Check, to hold it), emailed or not, whatever its
 * batch, and so do the same business's other rows.
 */
async function followConfirm(row) {
  const r0 = row && rowById(row.id);
  if (!r0) return;
  await loadPipe(r0.showId, true);
  const r = rowById(row.id), pr = r && pipeRow(r);
  if (!pipeData(r0.showId)) { toast('Saved here, but the pipeline couldn’t be read, so its row wasn’t changed. Open the exhibitor again in a moment to make your call there.'); return; }
  if (!pr) return;
  let value = '', said = '';
  if (r.emailable === 'corporate' && pr.can === 'Check' && !pr.touches) { value = 'Yes (Ltd)'; said = 'Company confirmed, and the pipeline can email them now'; }
  else if (r.emailable === 'consent' && (pr.can === 'Check' || pr.can === 'Yes (Ltd)')) { value = 'Consent needed'; said = 'Saved, and the pipeline won’t cold-email them now (Consent needed)'; }
  else if (r.emailable === 'check' && pr.can === 'Yes (Ltd)') { value = 'Check'; said = 'Saved, and the pipeline holds them as Check until you decide'; }
  if (!value) return;
  try { const done = await setCanEmail(r, value, pr.can, true); toast(said + (typeof done === 'string' ? done : '')); if (sheet.open && $('#sheetTitle') && $('#sheetTitle').textContent === r.name) openRow(r.id); }
  catch (e) { toast('Saved here, but the pipeline wasn’t changed: ' + e.message); }
}

/** Go: the pipeline's own import of this show's checked exhibitors, then a fast-lane batch you start in HQ. */
function openGo(s) {
  const d = pipeData(s.id) || {}, sh = d.show;
  openSheet(`${head(sh ? 'Go again' : 'Go')}
    <p>Brings ${esc(s.name)}’s checked exhibitors into the pipeline, with its own rules for Can email, priority, sectors and opt-outs. Then it makes a fast-lane batch of the P1 and P2 ones. Nothing is emailed: you check the batch in HQ and press Start.</p>
    <form id="goForm" data-id="${esc(s.id)}" novalidate>
      <label class="lbl" for="go-name">Show name in the pipeline</label>
      <input class="field" id="go-name" name="name" maxlength="120" autocomplete="off" value="${esc(sh ? sh.name : s.name)}">
      <label class="lbl" for="go-going">Are you going?</label>
      <select class="field" id="go-going" name="going">
        ${sh ? '<option value="keep" selected>Keep as it is</option>' : ''}
        <option value="yes">Yes, I’m going</option>
        <option value="no"${!sh ? ' selected' : ''}>No</option>
      </select>
      <label class="lbl" for="go-days">Which days</label>
      <input class="field" id="go-days" name="days" maxlength="60" autocomplete="off" placeholder="All, or for example Sat 7 Nov" value="${esc(sh && sh.visitDay ? sh.visitDay : '')}">
      <label class="lbl" for="go-page">Landing page</label>
      <input class="field" id="go-page" name="page" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="The sector’s own, such as olympia" value="${esc(sh && sh.page ? sh.page : '')}">
      <p class="hint">The showsum page the emails link to, such as olympia or christmas. Leave it empty for the sector’s own.</p>
      <label class="check-row"><input type="checkbox" name="fast" checked> Make a fast-lane batch of the P1 and P2 ones</label>
      <div class="actions"><button class="btn primary" type="submit">Go</button><button class="btn" type="button" data-act="close">Cancel</button></div>
    </form>`);
}
async function submitGo(f) {
  const id = f.dataset.id, s = showById(id);
  if (!s) return;
  const going = f.going.value === 'yes' ? true : f.going.value === 'no' ? false : undefined;
  const body = { showId: id, name: f.name.value.trim(), days: going === true ? f.days.value.trim() : '', page: f.page.value.trim(), fast: !!f.fast.checked };
  if (going !== undefined) body.going = going;
  await withBusy(f.querySelector('[type=submit]'), async () => {
    busyToast('Go: the pipeline is bringing them in…');
    let j;
    try { j = await HQ.call('goShow', body, 170000); } catch (e) { toast(e.message); return; }
    hideToast();
    openGoResult(s, j, body.fast);
    loadPipe(id, true); loadChecks();
  });
}
function openGoResult(s, j, asked) {
  const g = j.go || {}, fast = j.fast, t = g.tally || {};
  const li = (n, text) => (n ? `<li><b class="num">${esc(n)}</b> ${esc(text)}</li>` : '');
  const fastLine = !asked ? ''
    : fast && fast.id ? `<p><b>Fast-lane batch ${esc(fast.id)}</b> made with ${esc(C.plural(fast.size, 'business', 'businesses'))}. It isn’t started: open it in HQ, check Members, then press Start.</p>`
    : fast && fast.error ? `<p class="hint">The fast-lane batch wasn’t made: ${esc(fast.error)}</p>`
    : '<p class="hint">No fast-lane batch: no P1 or P2 business is due a first email outside a batch.</p>';
  openSheet(`${head('Done: ' + (g.showName || s.name))}
    <ul class="go-sum">
      <li><b class="num">${esc(g.fresh || 0)}</b> new businesses in the pipeline</li>
      ${li(g.otherSector, 'already in the sheet from another sector, added as New')}
      ${li(g.prev, 'contacted before in this sector, added as Previously contacted for you to check')}
      ${li(g.refreshed, 'already here and now Yes (Ltd), from the checks in Exhibitor Leads')}
      ${li(g.held, 'already here and now not emailed, as you decided in Exhibitor Leads')}
      ${li(g.twins, 'more rows of those businesses, from other shows, held the same way')}
      ${li(g.moved, 'left as they were: Prospects moved while saving, so Go again')}
      ${li(g.here, 'were already in this show')}
      ${li(g.merged, 'extra listings for the same business, merged')}
      ${li(g.optedOut, 'kept out because their email opted out')}
      ${li(g.waiting, 'still being checked in Exhibitor Leads: Go again once they’re done')}
      <li>P1 <b class="num">${esc(t.P1 || 0)}</b> · P2 <b class="num">${esc(t.P2 || 0)}</b> · P3 <b class="num">${esc(t.P3 || 0)}</b> · P4 <b class="num">${esc(t.P4 || 0)}</b> · P5 <b class="num">${esc(t.P5 || 0)}</b></li>
      <li>${g.going ? `Going${g.days && g.days !== 'all' ? ': ' + esc(g.days) : ''}` : 'Not marked as going'}${g.page ? ` · links open /showsum/${esc(g.page)}/` : ''}</li>
    </ul>
    ${fastLine}
    <div class="actions"><a class="btn primary" href="../#/overview">Open batches in HQ</a><button class="btn" type="button" data-act="close">Done</button></div>`);
}

/* ---------- Sheets ---------- */
const sheet = $('#sheet');
function openSheet(html) {
  $('#sheetBody').innerHTML = `<div class="grabber"></div>` + html;
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
}
function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

/* ---------- Gestures ----------
 * Swipe right on a screen to go up a level (an exhibition to its sector, a sector to home). Swipe right on a popup to close it,
 * or, where the popup has its own Back (Why this result?, Enter company number), to go back one step. Drag a popup's handle or
 * title down to close it. The screen follows your finger; let go past a third of the way, or flick, and it happens, otherwise it
 * springs back. Never on text boxes or anything that scrolls sideways, and never when the swipe is mostly
 * up or down, so scrolling is untouched. With less motion asked for, nothing slides: the arrow shows and it simply happens. */
const G = { on: null };
const lessMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const NO_SWIPE = 'input, textarea, select, [contenteditable], .find';
function scrollsSideways(el, stop) {
  for (let x = el; x && x !== stop && x !== document.body && x.nodeType === 1; x = x.parentElement) {
    if (x.scrollWidth > x.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(x).overflowX)) return true;
  }
  return false;
}
function dragEl(g) { return g.kind === 'page' ? $('#main') : sheet; }
function dragTo(g, px) {
  const el = dragEl(g), arrow = $('#swipeBack');
  if (g.kind === 'page') {
    const p = Math.min(1, px / (innerWidth / 3));
    arrow.style.opacity = String(p); arrow.classList.toggle('ready', p >= 1);
    arrow.style.transform = `translateX(${Math.round(Math.min(px / 4, 16))}px)`;
  }
  if (lessMotion()) return;
  el.style.transform = g.kind === 'down' ? `translateY(${px}px)` : `translateX(${px}px)`;
}
function dragReset(g) {
  const el = dragEl(g), arrow = $('#swipeBack');
  el.style.transition = ''; el.style.transform = ''; el.style.willChange = '';
  arrow.style.opacity = '0'; arrow.style.transform = ''; arrow.classList.remove('ready');
}
function dragDone(g) {
  if (g.kind === 'page') return goUp();
  if (g.kind === 'sheet') { const back = sheet.querySelector('[data-act=back-to-row], [data-act=pick-back]'); if (back) back.click(); else closeSheet(); }
  else closeSheet();
  return 'go';
}
/** Puts the screen back in place once the new one is drawn: at once, or when the browser has stepped back (a moment later). */
function dragSettle(g, how) {
  if (how !== 'back') { dragReset(g); return; }
  let done = false;
  const fin = () => { if (!done) { done = true; requestAnimationFrame(() => dragReset(g)); } };
  addEventListener('popstate', fin, { once: true });
  setTimeout(fin, 400);
}
function dragEnd(g, at) {
  const el = dragEl(g);
  const d = g.kind === 'down' ? g.dy : g.dx, size = g.kind === 'down' ? el.getBoundingClientRect().height : innerWidth;
  const fast = d > 40 && d / Math.max(1, at - g.t0) > 0.5;
  const go = d > size / (g.kind === 'down' ? 4 : 3) || fast;
  if (lessMotion()) { dragReset(g); if (go) dragDone(g); return; }
  el.style.transition = 'transform .18s cubic-bezier(.2, .8, .2, 1)';
  if (!go) { el.style.transform = ''; $('#swipeBack').style.opacity = '0'; setTimeout(() => dragReset(g), 190); return; }
  el.style.transform = g.kind === 'down' ? 'translateY(100%)' : `translateX(${innerWidth}px)`;
  setTimeout(() => dragSettle(g, dragDone(g)), 170);
}
document.addEventListener('touchstart', (e) => {
  G.on = null;
  if (e.touches.length !== 1) return;
  const t = e.touches[0], target = e.target;
  const inSheet = sheet.open && sheet.contains(target);
  if (sheet.open && !inSheet) return;   // the dimmed backdrop: a tap there closes, that is all
  const g = { x0: t.clientX, y0: t.clientY, t0: e.timeStamp, dx: 0, dy: 0, dir: '' };
  if (inSheet && target.closest('.grabber, .sheet-head') && !target.closest('button, a') && sheet.scrollTop <= 0) { G.on = Object.assign(g, { kind: 'down' }); return; }
  if (target.closest(NO_SWIPE) || scrollsSideways(target, inSheet ? sheet : null) || String((window.getSelection && getSelection()) || '').length) return;
  if (!inSheet && !parentOf(S.route)) return;   // the home screen: nowhere to go up to
  if (!inSheet && !standalone && t.clientX < 24) return;   // in a browser tab its own edge swipe already goes back
  G.on = Object.assign(g, { kind: inSheet ? 'sheet' : 'page' });
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  const g = G.on;
  if (!g || e.touches.length !== 1) return;
  const t = e.touches[0];
  g.dx = t.clientX - g.x0; g.dy = t.clientY - g.y0;
  if (!g.dir) {
    if (Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) return;
    g.dir = g.kind === 'down' ? (g.dy > 0 && g.dy > Math.abs(g.dx) ? 'y' : 'no') : (g.dx > 0 && g.dx > Math.abs(g.dy) * 1.5 ? 'x' : 'no');
    if (g.dir === 'no') { G.on = null; return; }
    dragEl(g).style.willChange = 'transform';
  }
  if (e.cancelable) e.preventDefault();   // nothing scrolls while you drag
  dragTo(g, Math.max(0, g.dir === 'y' ? g.dy : g.dx));
}, { passive: false });
document.addEventListener('touchend', (e) => { const g = G.on; G.on = null; if (g && g.dir) dragEnd(g, e.timeStamp); }, { passive: true });
document.addEventListener('touchcancel', () => { const g = G.on; G.on = null; if (g && g.dir) dragReset(g); }, { passive: true });
const head = (title) => `<div class="sheet-head"><h2 id="sheetTitle">${esc(title)}</h2><button class="icon-btn" type="button" data-act="close" aria-label="Close">${ICON.x}</button></div>`;

/* Detail */
function kv(label, value, sub) {
  if (!value) return '';
  return `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${value}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</div>`;
}

function openRow(id) {
  const r = rowById(id);
  if (!r) return;
  const st = C.statusOf(r), s = showById(r.showId) || {};
  const done = st !== 'pending';
  const link = (href, text) => `<a href="${esc(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${esc(text)}</a>`;
  const coUrl = C.companyUrl(r.companyNo);
  const needsAnswer = done && (r.legal === 'likely' || r.legal === 'possible') && r.legalSrc !== 'Confirmed by you';
  const contactSrc = r.contact ? (r.contactSrc ? `From ${r.contactSrc}` : '') : '';
  const emailSub = [C.emailKindLabel(r.emailKind), r.emailSrc ? `from ${r.emailSrc}` : ''].filter(Boolean).join(', ');
  const SURE = { verified: 'Confirmed', likely: 'Likely the same company', possible: 'Possibly the same company' };
  const company = r.companyNo ? [
    kv('Company', esc(r.companyName), [C.companyTypeLabel(r.companyType), r.companyStatus].filter(Boolean).join(', ')),
    kv('Company number', `<span class="v-copy"><span>${coUrl ? link(coUrl, r.companyNo) : esc(r.companyNo)}</span><button class="copy-btn" type="button" data-act="copy-text" data-text="${esc(r.companyNo)}" data-what="Company number" aria-label="Copy company number">${ICON.copy}</button></span>`, r.companyAddr),
    kv('How sure', esc(SURE[r.legal] || ''), r.legalSrc),
    kv('Director', esc(r.chDirector), 'From Companies House'),
  ].join('') : kv('Company', 'No company found', r.legalSrc && r.legalSrc !== 'No company found' ? r.legalSrc : '');
  const others = (r.alsoIn || []).map(showById).filter(Boolean), listed = C.listedCount(r);
  const alsoIn = others.length ? `<div class="kv"><span class="k">Also in</span>${others.map((o) => `<span class="v">${esc(o.name)}</span><span class="s">${esc([o.start ? C.fmtDates(o.start, o.end) : '', o.sector].filter(Boolean).join(' · '))}</span>`).join('')}</div>` : '';
  openSheet(`${head(r.name)}
    <span class="tag ${st}">${esc(C.STATUS_LABEL[st])}</span>${done ? `<span class="tag">${logo(C.providerOf(r))}${esc(C.workspaceShort(r))}</span>` : ''}${listed >= 2 ? `<span class="tag">In ${listed} exhibitions</span>` : ''}
    <p>${esc(C.emailRule(r))}</p>
    ${needsAnswer ? `<div class="actions" style="margin-top:10px"><button class="btn primary" type="button" data-act="match-yes" data-id="${esc(r.id)}">Yes, same company</button><button class="btn" type="button" data-act="match-no" data-id="${esc(r.id)}">No, a different one</button></div>` : ''}
    <h3>Contact</h3>
    ${kv('Email', r.email ? link('mailto:' + r.email, r.email) : '', emailSub)}
    ${kv('Phone', r.phone ? link('tel:' + r.phone.replace(/\s+/g, ''), r.phone) : '', r.phone && r.phoneSrc ? `From ${r.phoneSrc}` : '')}
    ${kv('Contact name', esc(r.contact), contactSrc)}
    ${kv('Website', r.website ? link(r.website, r.website.replace(/^https?:\/\//, '')).replace('<a ', '<a data-chrome="1" ') : '')}
    ${!r.email && !r.phone && !r.contact && !r.website ? '<p class="small">Nothing found yet. Edit the details to add what you know.</p>' : ''}
    ${pipeRowHtml(r)}
    <h3>Company</h3>
    ${company}
    <div class="actions" style="margin-top:10px"><button class="btn" type="button" data-act="find-co" data-id="${esc(r.id)}">Find on Companies House</button><button class="btn" type="button" data-act="company-no" data-id="${esc(r.id)}">Enter company number</button></div>
    <h3>Email setup</h3>
    ${kv('Provider', logo(C.providerOf(r)) + esc(C.workspaceLabel(r)))}
    ${done ? kv('Also uses', esc(r.alsoUses), 'From its domain records. Not finding a service does not mean they do not use it.') : ''}
    <h3>At the show</h3>
    ${kv('Exhibition', esc(s.name || ''), s.start ? C.fmtDates(s.start, s.end) : '')}
    ${alsoIn}
    ${kv('Stand', esc(r.stand))}${kv('Category', esc(r.category))}${kv('About', esc(r.blurb))}${kv('Notes', esc(r.note))}
    <div class="actions"><button class="btn primary" type="button" data-act="edit-row" data-id="${esc(r.id)}">Edit details</button>
    <button class="btn" type="button" data-act="recheck" data-id="${esc(r.id)}">Check again</button>
    ${done ? `<button class="btn" type="button" data-act="explain-row" data-id="${esc(r.id)}">Why this result?</button>` : ''}
    <button class="btn" type="button" data-act="remove-row" data-id="${esc(r.id)}">Remove</button></div>`);
}

/* Why this result? A check run again without saving, with every page it read and what the register said */
function openExplain(id, j) {
  const r = rowById(id) || {};
  const x = C.explainText(r, j);
  S.whyText = x.text;
  openSheet(`${head('Why this result?')}
    <p class="small">${esc(r.name || '')}. This ran the check again without saving anything.</p>
    <div class="why-cmp"><span>Saved on your sheet: <b>${esc(x.saved)}</b></span><span>A fresh check now: <b>${esc(x.now)}</b></span></div>
    ${x.changed ? '<p class="hint">The fresh check differs from what is saved. Use Check again to keep it.</p>' : ''}
    <pre class="why" id="whyText">${esc(x.lines.join('\n') || 'Nothing was read.')}</pre>
    <div class="actions"><button class="btn primary" type="button" data-act="copy-why">Copy</button><button class="btn" type="button" data-act="back-to-row" data-id="${esc(id)}">Back</button></div>`);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove();
    return ok;
  } catch (e) { return false; }
}

function openEditRow(id) {
  const r = rowById(id);
  if (!r) return;
  const f = (name, label, val, attrs) => `<label class="lbl" for="er-${name}">${label}</label><input class="field" id="er-${name}" name="${name}" value="${esc(val || '')}" ${attrs || ''} autocomplete="off">`;
  openSheet(`${head('Edit details')}
    <form id="editRowForm" data-id="${esc(r.id)}" novalidate>
      ${f('contact', 'Contact name', r.contact)}
      ${f('email', 'Email', r.email, 'type="email" inputmode="email"')}
      ${f('phone', 'Phone', r.phone, 'type="tel" inputmode="tel"')}
      ${f('website', 'Website', r.website, 'type="url" inputmode="url"')}
      <label class="lbl" for="er-note">Notes</label><textarea class="field" id="er-note" name="note" rows="3">${esc(r.note || '')}</textarea>
      <p class="hint">Changing the website or email starts the checks again for this business.</p>
      <div class="actions"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-act="back-to-row" data-id="${esc(r.id)}">Cancel</button></div>
    </form>`);
}

/* Find on Companies House: search by name (or number), see the matches, choose one and confirm it */
const nice = (t) => { t = String(t || '').replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

function pickListHtml() {
  const p = S.pick || {};
  if (p.err) return `<p class="hint">${esc(p.err)}</p>`;
  if (!p.items) return '';
  if (!p.items.length) return '<p class="hint">Nothing found. Try fewer words, or the company number.</p>';
  return `<div class="menu picks">${p.items.map((c, i) => `<button type="button" data-act="pick-co" data-i="${i}"${c.status && c.status !== 'active' ? ' class="off"' : ''}>${esc(c.name)}<small>${esc([nice(c.status), c.no, C.companyTypeLabel(c.type)].filter(Boolean).join(' · '))}</small>${c.addr ? `<small>${esc(c.addr)}</small>` : ''}</button>`).join('')}</div>`;
}

function openPicker(id, keep) {
  const r = rowById(id) || {};
  const q = keep ? keep.q : (r.companyName || r.name || '');
  S.pick = { id, q, items: keep ? keep.items : null, err: '' };
  openSheet(`${head('Find on Companies House')}
    <p class="small">${esc(r.name || '')}. Type the company name, or paste its number, then choose the right one.</p>
    <form id="pickForm" data-id="${esc(id)}" novalidate>
      <div class="field-row"><input class="field" id="pickQ" name="q" value="${esc(q)}" placeholder="Company name or number" autocomplete="off" autocapitalize="characters" enterkeyhint="search" maxlength="120" aria-label="Company name or number"><button class="btn primary" type="submit">Search</button></div>
    </form>
    <div id="pickList" aria-live="polite">${pickListHtml()}</div>
    <div class="actions"><button class="btn" type="button" data-act="back-to-row" data-id="${esc(id)}">Back</button></div>`);
}

function openPickConfirm(i) {
  const p = S.pick || {}, c = (p.items || [])[i], r = rowById(p.id) || {};
  if (!c) return;
  const live = !c.status || c.status === 'active';
  openSheet(`${head('Use this company?')}
    <p>${esc(r.name || 'This business')} will be set to the company below and marked as confirmed by you.</p>
    ${kv('Company', esc(c.name), [C.companyTypeLabel(c.type), nice(c.status)].filter(Boolean).join(', '))}
    ${kv('Company number', esc(c.no), c.addr)}
    ${live ? '' : '<p class="hint">This company is not active on the register, so the lead stays “to check” rather than “can email”.</p>'}
    <div class="actions"><button class="btn primary" type="button" data-act="pick-yes" data-i="${i}">Yes, use this company</button><button class="btn" type="button" data-act="pick-back">Back to the results</button></div>`);
}

function openCompanyNo(id) {
  openSheet(`${head('Company number')}
    <p>Look the company up on Companies House and type its number here. It is checked against the register.</p>
    <form id="companyForm" data-id="${esc(id)}"><label class="lbl" for="coNo">Company number</label>
      <input class="field" id="coNo" name="number" placeholder="For example 01234567 or SC123456" autocapitalize="characters" autocomplete="off" maxlength="12">
      <div class="actions"><button class="btn primary" type="submit">Check and save</button><button class="btn" type="button" data-act="back-to-row" data-id="${esc(id)}">Cancel</button></div></form>`);
}

/* Show forms */
function showForm(s, pre) {
  const sectors = C.sectorOptions(S.shows).map((o) => o.name);
  const v = s || {};
  const p = pre || {};
  return `<form id="showForm" data-id="${esc(v.id || '')}"${p.year ? ` data-year="${esc(p.year)}"` : ''} novalidate>
      <label class="lbl" for="sf-name" style="margin-top:6px">Exhibition name</label>
      <input class="field" id="sf-name" name="name" value="${esc(v.name || p.name || '')}" maxlength="120" autocomplete="off" placeholder="For example The Whisky Show">
      <label class="lbl" for="sf-sector">Sector</label>
      <input class="field" id="sf-sector" name="sector" list="sectorList" value="${esc(v.sector || p.sector || (S.route.v === 'sector' ? S.route.sector : S.set.lastSector) || '')}" maxlength="40" autocomplete="off" placeholder="For example Whisky and spirits">
      <datalist id="sectorList">${sectors.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <div class="two"><div><label class="lbl" for="sf-start">Starts<span class="from" id="sf-dates-from" hidden>from its site</span></label><input class="field" id="sf-start" name="start" type="date" value="${esc(v.start || p.start || '')}"></div>
      <div><label class="lbl" for="sf-end">Ends</label><input class="field" id="sf-end" name="end" type="date" value="${esc(v.end || p.end || '')}"></div></div>
      <label class="lbl" for="sf-venue">Venue<span class="from" id="sf-venue-from" hidden>from its site</span></label>
      <input class="field" id="sf-venue" name="venue" value="${esc(v.venue || p.venue || '')}" maxlength="120" autocomplete="off" placeholder="For example Olympia London">
      ${v.id ? '' : `<div class="lbl-row"><span class="lbl" id="sf-how">Exhibitors from</span>
        <div class="mode" role="radiogroup" aria-labelledby="sf-how">
          <button type="button" role="radio" aria-checked="true" data-act="sf-mode" data-mode="link">Link</button>
          <button type="button" role="radio" aria-checked="false" data-act="sf-mode" data-mode="list">List</button>
        </div></div>`}
      <div data-pane="link">
        <label class="lbl" for="sf-urls"${v.id ? '' : ' style="margin-top:4px"'}>Exhibitor list link</label>
        <textarea class="field" id="sf-urls" name="urls" rows="2" placeholder="Paste the address of the exhibitor list" autocapitalize="off" spellcheck="false">${esc((v.urls || []).join('\n') || p.url || '')}</textarea>
        <p class="hint">${v.id ? 'Add more than one link, each on its own line, if the list runs over several pages. You can also paste the list itself from the exhibition menu.' : 'Paste the show’s own website: the app finds its exhibitor list. Or the list’s own address. Have the list itself? Choose List.'}</p>
        ${v.id ? '' : '<div class="look" id="sf-look" role="status" hidden></div>'}
      </div>
      ${v.id ? '' : `<div data-pane="list" hidden>
        <label class="lbl" for="sf-list" style="margin-top:4px">Exhibitors</label>
        <textarea class="field" id="sf-list" name="list" rows="7" placeholder="Acme Ltd, www.acme.co.uk&#10;Beta Crafts&#10;Gamma Foods, gamma.com" autocapitalize="off" spellcheck="false"></textarea>
        <p class="hint">One per line. A website after the name helps: Acme Ltd, www.acme.co.uk. A spreadsheet copy with columns works too.</p>
      </div>
      <p class="hint mode-note" id="sf-note" role="status" hidden></p>`}
      <div class="actions"><button class="btn primary" type="submit">${v.id ? 'Save' : 'Add and load'}</button><button class="btn" type="button" data-act="close">Cancel</button></div>
    </form>`;
}

/** Link or List on the add form. A list moved over from the link box keeps its text, with a note saying why. */
function setShowMode(mode, note) {
  const f = $('#showForm');
  if (!f || !f.querySelector('.mode')) return;
  f.dataset.mode = mode;
  f.querySelectorAll('[data-act=sf-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  f.querySelectorAll('[data-pane]').forEach((x) => { x.hidden = x.dataset.pane !== mode; });
  f.querySelector('[type=submit]').textContent = mode === 'list' ? 'Add and check' : 'Add and load';
  const n = $('#sf-note'); n.textContent = note || ''; n.hidden = !note;
}
/** An exhibitor list pasted into the link box goes to the list box instead. True when it moved. */
function linkBoxToList() {
  const a = $('#sf-urls'), b = $('#sf-list');
  if (!a || !b || C.linkBoxKind(a.value).kind !== 'list') return false;
  b.value = (b.value.trim() ? b.value.trim() + '\n' : '') + a.value.trim();
  a.value = '';
  setShowMode('list', 'That looks like a list of exhibitors, so it will be added as one.');
  return true;
}
function openAddShow(pre) {
  // a listings page shared to the app: offer to keep it as a search page; the app does not read it
  if (pre && pre.url && C.isDirectory(pre.url)) {
    openAddSearch(S.route.v === 'sector' ? S.route.sector : (S.set.lastSector || ''), { url: pre.url, label: pre.name, shared: true, host: (/^https?:\/\/(?:www\.)?([^\/?#]+)/i.exec(pre.url) || [])[1] });
    return;
  }
  openSheet(head('Add exhibition') + showForm(null, pre));
  // filled in from the Show diary: say so beside the dates and the venue, as a show's own website does
  if (pre && pre.diary) [['#sf-dates-from', pre.start], ['#sf-venue-from', pre.venue]].forEach(([id, has]) => { const m = $(id); if (m && has) { m.textContent = 'from the diary'; m.hidden = false; } });
  if (!linkBoxToList() && pre && pre.url) lookUp(pre.url);
}

/**
 * Reads the show's own website (Apps Script does, where its robots.txt allows) and fills in what it says: the dates, the
 * venue, the name if empty, and the link to its exhibitor list. Never overwrites what you typed. Says what it found, or why not.
 */
let lookSeq = 0;
async function lookUp(url) {
  const f = $('#showForm'), box = $('#sf-look');
  if (!f || f.dataset.id || !box) return;
  const seq = ++lookSeq;
  const still = () => seq === lookSeq && document.body.contains(box);
  f.dataset.contact = '';   // a contact from an earlier look is never saved with a different link
  box.hidden = false; box.className = 'look';
  if (C.isDirectory(url)) {
    const host = (/^https?:\/\/(?:www\.)?([^\/?#]+)/i.exec(C.validUrl(url)) || [])[1] || 'that site';
    box.className = 'look warn';
    box.innerHTML = `That’s a page on ${esc(host)}, which the app does not read. From it, open the show’s own website and share that.<br><button class="link-btn" type="button" data-act="save-listing" data-url="${esc(url)}">Keep it as a search page</button>`;
    return;
  }
  box.innerHTML = '<span class="spinner" aria-hidden="true"></span>Looking at the show’s website…';
  let j;
  try { j = await call('lookShow', { url }); } catch (e) {
    if (!still()) return;
    if (/unknown action/i.test(e.message)) { box.hidden = true; return; }   // an Apps Script from before release 17
    box.className = 'look warn'; box.textContent = 'Could not read the website: ' + e.message; return;
  }
  if (!still()) return;
  const set = (id, val, mark) => { const el = $(id); if (el && val && !el.value.trim()) { el.value = val; if (mark) $(mark).hidden = false; return true; } return false; };
  if (j.directory) {
    box.className = 'look warn';
    box.innerHTML = `That’s a listings page on ${esc(j.host)}, which the app does not read. From it, open the show’s own website and share that.<br><button class="link-btn" type="button" data-act="save-listing" data-url="${esc(url)}">Keep it as a search page</button>`;
    return;
  }
  if (j.blocked || j.error) { box.className = 'look warn'; box.textContent = (j.note || j.error) + '. Add the exhibitor list link yourself, or choose List and paste it.'; return; }
  // the organiser's contact for stands, from its own pages: kept on the form and saved with the exhibition
  f.dataset.contact = j.contact ? JSON.stringify(j.contact) : '';
  const addOrg = () => { if (j.contact) box.insertAdjacentHTML('beforeend', `<span class="look-org">${ICON.mail}<span>${esc(contactSummary(j.contact))}</span></span>`); };
  set('#sf-name', j.name);
  // a diary show not dated yet: the website may still be showing this year's edition, whose dates and list are not this one's
  const year = f.dataset.year;
  if (year && j.start && !C.fitsYear(j.start, year)) {
    box.className = 'look';
    box.innerHTML = `Its website still shows ${esc(C.fmtDates(j.start, j.end))}.<small>Those are not the ${esc(year)} dates, so they are left empty, and so is its current exhibitor list. Add the show now and fill them in when they are out.</small>`;
    addOrg();
    return;
  }
  if (set('#sf-start', j.start, '#sf-dates-from')) set('#sf-end', j.end);
  set('#sf-venue', j.venue, '#sf-venue-from');
  const box2 = $('#sf-urls');
  if (j.listUrl && !j.self && box2 && C.validUrl(box2.value.trim()) === C.validUrl(url)) box2.value = j.listUrl;
  if (j.listUrl && j.count) {
    box.className = 'look ok';
    box.innerHTML = j.self ? `<b>✓ This is the exhibitor list</b><small>About ${esc(j.count)} names on it</small>`
      : `<b>✓ Found the exhibitor list</b> on the show’s website<small>${j.listText ? `“${esc(j.listText)}” · ` : ''}about ${esc(j.count)} names</small>`;
  } else if (j.listUrl) {
    box.className = 'look warn';
    box.innerHTML = `Found its exhibitor page${j.listText ? ` (“${esc(j.listText)}”)` : ''}, but no names could be read from it yet.<small>Try Add and load anyway, or choose List and paste the names.</small>`;
  } else {
    box.className = 'look';
    box.innerHTML = 'No exhibitor list on its website yet.<small>Add the show now and load the list when it appears, often a few weeks before. Or paste it.</small>';
  }
  addOrg();
}
/** "Organiser: Baby Shows Ltd · Sarah Jones, Sales Manager · sarah.jones@… · 024 7699 0011" */
function contactSummary(c) {
  const who = [c.name, c.role].filter(Boolean).join(', ');
  return ['Organiser contact' + (c.organiser ? `: ${c.organiser}` : ''), who, c.email, c.phone].filter(Boolean).join(' · ');
}

/** The organiser and who to talk to about a stand, as read from the show's own site, with tap to email or call. */
function organiserHtml(s) {
  if (!s.organiser && !s.contactEmail && !s.contactPhone && !s.contactName) return '';
  const who = [s.contactName, s.contactRole].filter(Boolean).join(' · ');
  return `<div class="org" aria-label="Organiser contact">
      <p class="org-h">${s.organiser ? `Organiser <b>${esc(s.organiser)}</b>` : 'Organiser contact'}</p>
      ${who ? `<p class="org-who">${esc(who)}</p>` : ''}
      <div class="org-links">
        ${s.contactEmail ? `<a class="org-l" href="mailto:${esc(s.contactEmail)}">${ICON.mail}<span>${esc(s.contactEmail)}</span></a>` : ''}
        ${s.contactPhone ? `<a class="org-l" href="tel:${esc(String(s.contactPhone).replace(/\s+/g, ''))}">${ICON.phone}<span class="num">${esc(s.contactPhone)}</span></a>` : ''}
        ${s.contactPage ? `<a class="org-src" href="${esc(s.contactPage)}" target="_blank" rel="noopener" data-chrome="1">From its site${ICON.ext}</a>` : ''}
      </div></div>`;
}
/** Reads an exhibition's own site for its organiser contact (Apps Script release 18), saves it and shows it. */
async function findOrganiser(s, btn) {
  await withBusy(btn, async () => {
    try {
      const j = await call('findOrganiser', { id: s.id }, 120000);
      const i = S.shows.findIndex((x) => x.id === s.id);
      if (i >= 0 && j.show) S.shows[i] = Object.assign({}, S.shows[i], j.show);
      put('shows', S.shows);
      closeSheet();
      const h = $('#showHero'); if (h) h.dataset.key = '';
      updateShow();
      toast(j.contact ? 'Found the organiser contact on its site' : j.kept ? 'Nothing new on its site, so the contact found before is kept' : 'No organiser contact on its site. Its own pages may not give one');
    } catch (e) { toast(oldScript(e)); }
  });
}
/** Removes a saved organiser contact that is wrong or out of date. */
async function clearOrganiser(s, btn) {
  await withBusy(btn, async () => {
    try {
      const j = await call('findOrganiser', { id: s.id, clear: true });
      const i = S.shows.findIndex((x) => x.id === s.id);
      if (i >= 0 && j.show) S.shows[i] = Object.assign({}, S.shows[i], j.show);
      put('shows', S.shows);
      closeSheet();
      const h = $('#showHero'); if (h) h.dataset.key = '';
      updateShow();
      toast('Organiser contact removed');
    } catch (e) { toast(oldScript(e)); }
  });
}
/** The diary show this exhibition is, if its sector has a diary. */
function showDiaryEntry(s) { return s ? C.diaryEntryFor(s, diaryData(s.sector)) : null; }
function openEditShow(s) { openSheet(head('Edit exhibition') + showForm(s)); }

function openPaste(s) {
  openSheet(`${head('Paste the list')}
    <p>Paste the exhibitor names, one per line. A website after the name helps: <span class="small">Acme Ltd, www.acme.co.uk</span>. A spreadsheet copy with columns works too.</p>
    <form id="pasteForm" data-id="${esc(s.id)}"><label class="lbl" for="pasteText" style="margin-top:6px">Exhibitors</label>
      <textarea class="field" id="pasteText" name="text" rows="9" placeholder="Acme Ltd, www.acme.co.uk&#10;Beta Crafts&#10;Gamma Foods, gamma.com" autocapitalize="off" spellcheck="false"></textarea>
      <div class="actions"><button class="btn primary" type="submit">Add to this exhibition</button><button class="btn" type="button" data-act="close">Cancel</button></div></form>`);
}

function openShowMenu(s) {
  const rows = S.rows[s.id] || [], c = C.countRows(rows);
  const filtered = S.filter !== 'all' || S.q;
  openSheet(`${head(s.name)}
    <div class="menu">
      <button type="button" data-act="edit-show">Edit details<small>Name, dates, sector and links</small></button>
      <button type="button" data-act="paste">Paste a list<small>Add exhibitors by hand</small></button>
      ${s.urls.length ? '<button type="button" data-act="load">Load the list again<small>New exhibitors are added, existing ones are kept</small></button>' : ''}
      ${s.urls.length ? `<button type="button" data-act="find-organiser">${s.contactAt ? 'Look for the organiser contact again' : 'Find the organiser contact'}<small>Reads the show’s own Exhibit and Contact pages for who sells the stands</small></button>` : ''}
      ${s.organiser || s.contactEmail || s.contactPhone || s.contactName ? '<button type="button" data-act="clear-organiser">Remove the organiser contact<small>If it is wrong or out of date. Add it again from here any time</small></button>' : ''}
      ${c.likely ? `<button type="button" data-act="confirm-likely">Confirm ${c.likely} likely ${c.likely === 1 ? 'match' : 'matches'}<small>Same name on Companies House, active. Treats them as confirmed</small></button>` : ''}
      ${c.check ? `<button type="button" data-act="recheck-weak">Check the ${c.check} “to check” again<small>Uses the newer company rules. Ones you confirmed are kept</small></button>` : ''}
      ${c.total ? '<button type="button" data-act="recheck-all">Check everything again<small>Runs the website, email and company checks again</small></button>' : ''}
      ${filtered && c.total ? '<button type="button" data-act="csv-shown">Download only what is shown<small>Uses the current filter and search</small></button>' : ''}
      ${S.status && S.status.sheetUrl ? `<button type="button" data-act="open-sheet">Open the Google Sheet<small>Where all of this is kept</small></button>` : ''}
      <button type="button" data-act="delete-show">Delete exhibition<small>Removes it and its exhibitors from your sheet</small></button>
    </div>`);
}

function openConfirm(title, body, act, label, id) {
  openSheet(`${head(title)}<p>${esc(body)}</p><div class="actions"><button class="btn primary" type="button" data-act="${act}" data-id="${esc(id || '')}">${esc(label)}</button><button class="btn" type="button" data-act="close">Cancel</button></div>`);
}

/* Settings */
function statusBox() {
  const st = S.status;
  if (!st) return '';
  return `<div class="status-box" id="statusBox"><p>Connected to Exhibitor Leads.</p>
    <p>Exhibitor Leads script release: ${st.build ? '<strong>' + esc(st.build) + '</strong>' : '<strong>older than release ' + EXPECT_BUILD + '</strong>'}${C.scriptOutdated(st.build || 0, EXPECT_BUILD) ? '. This app expects ' + EXPECT_BUILD + '. Paste the new Code.gs and choose Deploy, Manage deployments, the pencil, New version' : ', up to date'}</p>
    <p>Companies House key: ${st.ch ? 'set' : '<strong>not set</strong>, so company checks will say consent needed'}</p>
    <p>Background checks: ${st.trigger ? 'on, every 10 minutes' : '<strong>off</strong>. Run setup again in Apps Script'}</p></div>`;
}

/* ---------- Notifications: a message in the ntfy app every time a check finishes, whether or not you are in the app ---------- */
const NTFY_PLAY = 'https://play.google.com/store/apps/details?id=io.heckel.ntfy', NTFY_APPSTORE = 'https://apps.apple.com/app/ntfy/id1625396347';
const appUrl = () => new URL('./', location.href).href;
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

function notifyHtml() {
  const st = S.status;
  if (!S.api || !st) return '<div id="notifyBox"></div>';
  const n = st.notify;
  let h = '<div id="notifyBox"><h3>Notifications</h3>';
  if (!n) h += '<p class="hint">These need release 12 of the Apps Script. Deploy the new version first.</p>';
  else if (n.on) h += `<p>On. You get a message in the ntfy app every time a check finishes, whether or not you are in this app, even for a single exhibitor. It can take up to a minute to arrive.${isIOS ? ' On iPhone, open Exhibitor Leads from your Home Screen.' : ' Tap the link in the message to open that exhibition.'}</p>
      <div class="actions"><button class="btn" type="button" data-act="notify-test">Send test notification</button><button class="btn" type="button" data-act="notify-setup">Setup steps</button><button class="btn" type="button" data-act="notify-off">Turn off</button></div>
      <p class="notify-result${n.last && !n.last.ok ? ' bad' : ''}" role="status">${esc(lastNotifyLine(n.last))}</p>`;
  else h += `<p>Get a message on your phone every time a check finishes, whether or not you are in the app. It uses ntfy, a free notification app with no account. Shared with the Exhibitor Leads phone app: set up here, a tap on the message opens this page.</p>
      <div class="actions"><button class="btn primary" type="button" data-act="notify-setup">Set up notifications</button></div>`;
  return h + '</div>';
}

async function openNotifySetup() {
  const have = S.status && S.status.notify && S.status.notify.topic;
  const topic = have || C.makeTopic(randomBytes);
  try { await call('setNotify', { topic, url: isIOS ? '' : appUrl() }); }   // on iPhone a tap would open Safari, which has none of your settings, so no link
  catch (e) { toast(oldScript(e)); return; }
  S.status = Object.assign({}, S.status, { notify: { on: true, topic, click: !isIOS } }); put('status', S.status);
  const deep = `ntfy://ntfy.sh/${topic}?display=Exhibitor%20Leads`;
  const steps = isIOS ? `
    <li><strong>Install ntfy</strong>A free notification app. No account needed.<br><a class="btn" href="${NTFY_APPSTORE}" target="_blank" rel="noopener">Get ntfy</a></li>
    <li><strong>Copy your notification code</strong><button class="btn" type="button" data-act="copy-topic" data-text="${esc(topic)}">Copy code</button><span class="code">${esc(topic)}</span></li>
    <li><strong>Subscribe in ntfy</strong>Tap +, paste the code as the topic and tap Subscribe.</li>`
  : `
    <li><strong>Install ntfy</strong>A free notification app. No account needed.<br><a class="btn" href="${isAndroid ? NTFY_PLAY : 'https://ntfy.sh'}" target="_blank" rel="noopener">Get ntfy</a></li>
    <li><strong>Connect it to Exhibitor Leads</strong><a class="btn" href="${esc(deep)}">Connect ntfy</a><span class="small" style="display:block;margin-top:6px">Or copy the code and subscribe by hand: <span class="code">${esc(topic)}</span></span></li>
    ${isAndroid ? '<li><strong>Turn on instant delivery</strong>In ntfy, open Exhibitor Leads, tap the ⋮ menu and enable instant delivery. Without it, messages can arrive late.</li>' : ''}`;
  openSheet(`${head('Get notifications')}
    <p>Every time a check finishes, whether or not you are in the app, ntfy tells you how many can be emailed. Even one exhibitor checked again sends a message.</p>
    <ol class="steps">${steps}</ol>
    <div class="actions"><button class="btn primary" type="button" data-act="settings">Done</button><button class="btn" type="button" data-act="notify-test">Send test notification</button></div>
    <p class="notify-result" role="status"></p>`);
}

/** What the last message did, in words. A check that finishes in the background has no screen to say so, so Settings does. */
function lastNotifyLine(l) {
  const d = l && l.at ? new Date(l.at) : null;
  if (!d || isNaN(d)) return '';
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
  const when = d.toDateString() === new Date().toDateString() ? time : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d) + ', ' + time;
  const what = l.kind === 'test' ? 'the test message' : 'the message for ' + (l.show || 'a check');
  return l.ok ? `Last message: ${what} was sent at ${when}.` : `Last message: ${what} could not be sent at ${when}. ${l.error || ''}`.trim();
}
function rememberNotify(ok, error) {
  if (!S.status || !S.status.notify) return;
  S.status = Object.assign({}, S.status, { notify: Object.assign({}, S.status.notify, { last: { at: new Date().toISOString(), kind: 'test', show: '', ok, error: error || '' } }) });
  put('status', S.status);
}

/* The result of the test message, written where you are looking (a pop-up alone is easy to miss). */
function showNotifyResult(msg, bad) {
  document.querySelectorAll('.notify-result').forEach((el) => { el.textContent = msg; el.classList.toggle('bad', !!bad); if (msg && el.offsetParent) { try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* older browser */ } } });
}

function usageHtml() {
  const u = S.usage;
  if (!S.api || !u) return '<div id="usageBox"></div>';
  const line = (label, m) => `<div class="use"><div class="use-row"><span>${label}</span><b>${esc(m.text)}</b></div><div class="bar" role="img" aria-label="${label}: ${esc(m.text)}"><i style="width:${m.width}%"></i></div></div>`;
  return `<div id="usageBox"><h3>Last 24 hours</h3>
    ${line('Web requests', u.fetches)}
    ${line('Background minutes', u.bg)}
    <p class="hint">Counts this app only. Google counts everything on your account, so its own figure may be a little higher. You will see a warning on the main screen above 70%.</p></div>`;
}

function insightHtml() {
  const st = S.status;
  if (!S.api || !st) return '<div id="insightBox"></div>';
  const ev = C.evidenceRows(st.evidence), sp = C.speedLines(st.speed), rc = C.recheckSummary(st.recheck);
  const totalCheck = totals().check;
  let h = '<div id="insightBox">';
  if (ev) {
    h += `<h3>How companies were matched</h3><div class="ev">${ev.rows.map((r) => `<div class="ev-row"><span class="dot ${r.tone}"></span><span>${esc(r.label)}</span><b>${r.n.toLocaleString('en-GB')}</b></div>`).join('')}</div>
      <p class="hint">Across ${ev.total.toLocaleString('en-GB')} checked businesses. A company number, an exact legal name or the company behind the brand on its own website counts as confirmed, and so does a name match backed by a matching postcode or by one of its directors. A similar name alone stays “to check”. Open any business and tap Why this result? to see what was read.</p>`;
  }
  const rs = C.reachSummary(st.reach);
  if (rs && rs.sites) {
    h += `<h3>Websites that would not open</h3><p><strong>${rs.sites.toLocaleString('en-GB')}</strong> of ${rs.checked.toLocaleString('en-GB')} checked websites (${esc(rs.pct)}) could not be read in full.</p>
      <div class="ev">${rs.lines.map((l) => `<div class="ev-row"><span class="dot check"></span><span>${esc(l.text)}</span><b>${l.n.toLocaleString('en-GB')}</b></div>`).join('')}</div>
      <p class="hint">Those businesses stay “to check” unless a company can be matched another way. In an exhibition, the Couldn’t read filter lists them, and Find on Companies House lets you pick the company yourself. The app never tries to get round a site that turns it away.</p>`;
  } else if (rs) h += `<h3>Websites that would not open</h3><p>None. Every one of the ${rs.checked.toLocaleString('en-GB')} websites checked so far could be read.</p>`;
  if (sp) {
    h += `<h3>Speed</h3><p>Each business takes about <strong>${esc(sp.per)}</strong> and ${esc(sp.requests)} web requests (last ${sp.n}), so roughly ${esc(sp.perHour)} an hour.</p>
      ${sp.parts.map((q) => `<div class="sp-row"><div class="use-row"><span>${esc(q.label)}</span><b>${esc(q.text)}</b></div><div class="bar" role="img" aria-label="${esc(q.label)}: ${esc(q.text)}"><i style="width:${q.width}%"></i></div></div>`).join('')}
      <p class="hint">The home page, mail records and company search go out together, so their time shows under Home page.${sp.slowest.length ? ' Slowest sites lately: ' + sp.slowest.map((x) => esc(x.host) + ' (' + esc(x.text) + ')').join(', ') + '.' : ''}</p>`;
  }
  if (rc) {
    const sh = rc.scope ? (S.shows.find((x) => x.id === rc.scope) || {}).name : '';
    h += `<h3>Checking the “to check” ones again</h3><p>${rc.queued ? `${C.plural(rc.queued, 'business', 'businesses')} ${rc.all ? 'that were “to check” or “consent needed”' : 'that were “to check”'} went back in the queue${sh ? ' for ' + esc(sh) : rc.scope ? '' : ' across every exhibition'}.` : 'Nothing needed checking again.'}${rc.pending ? ` <strong>${rc.pending.toLocaleString('en-GB')} still waiting.</strong>` : rc.queued ? ' All done.' : ''}</p>
      <div class="rc-grid"><span></span><span class="head">Before</span><span></span><span class="head">Now</span>${rc.rows.map((r) => `<span class="lab"><span class="dot ${r.key}"></span>${esc(r.label)}</span><b>${r.before.toLocaleString('en-GB')}</b><span class="arrow" aria-hidden="true">→</span><b>${r.now.toLocaleString('en-GB')}</b>`).join('')}</div>
      ${rc.gained ? `<p class="hint">${C.plural(rc.gained, 'more business', 'more businesses')} can now be emailed without asking first.</p>` : ''}`;
  }
  if (totalCheck) {
    h += `<h3>Check the “to check” ones again</h3><p>${C.plural(totalCheck, 'business', 'businesses')} across your exhibitions ${totalCheck === 1 ? 'is' : 'are'} marked “to check”. This runs them through the newer company rules. Start with one exhibition from its menu to see the effect first.</p>
      <div class="actions"><button class="btn" type="button" data-act="recheck-weak-all">Check them all again</button><button class="btn" type="button" data-act="recheck-weak-consent">Include consent needed</button></div>`;
  }
  return h + '</div>';
}

function openSettings() {
  openSheet(`${head('Settings')}
    <h3>Exhibitor Leads</h3>
    <p id="elConn">${S.api ? 'Connected through Showsum HQ with your HQ sign-in. Everything is kept in the Exhibitor Leads sheet in your own account; this page holds a copy in memory only, gone when you close it.'
      : 'Not connected yet. HQ needs EL_URL in its Script Properties, and Exhibitor Leads needs HQ_CLIENT_ID, ALLOWED_EMAIL and HQ_SUB in its own (the HQ README has the steps).'}</p>
    ${statusBox()}
    ${notifyHtml()}
    ${usageHtml()}
    ${insightHtml()}
    <h3>About</h3>
    <p class="small">For your own prospecting. Company status comes from Companies House and email setup from public mail records. Sole traders cannot be confirmed from the register, so anything unconfirmed is marked as needing consent. A guide only, not legal advice.</p>`);
  // Always ask again, so the usage shown is current
  if (S.api) call('status').then((j) => {
    S.status = j; put('status', j);
    if (!sheet.open || !$('#elConn')) return;
    const b = $('#statusBox');
    if (b) b.outerHTML = statusBox(); else $('#elConn').insertAdjacentHTML('afterend', statusBox());
    setUsage(j.usage);
    const ib = $('#insightBox');
    if (ib) ib.outerHTML = insightHtml();
    const nb = $('#notifyBox');
    if (nb) nb.outerHTML = notifyHtml();
  }).catch(() => {});
}

/* ---------- Themes ---------- */
function setTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  S.set.theme = t.id; saveSet();
  document.documentElement.dataset.theme = t.id;
  $('meta[name=theme-color]').setAttribute('content', t.bg);
  document.querySelectorAll('.theme-opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === t.id)));
}


/* ---------- Find shows ---------- */
const findOpen = () => !$('#findPanel').hidden;
let findPinned = false;   // the list was opened with the arrow, so it stays open while the box is empty

function findListHtml(text) {
  const opts = C.sectorOptions(S.shows, text);
  if (!opts.length) return `<p class="opt-note">No sector matches. Press Find shows to use “${esc(C.cleanSector(text))}” as a sector of your own.</p>`;
  return opts.map((o) => `<button class="opt${o.shows ? ' has' : ''}" type="button" role="option" data-sector="${esc(o.name)}"><span>${esc(o.name)}</span><span class="n">${o.shows || ''}</span></button>`).join('');
}
function setFindList(show) {
  const list = $('#findList');
  if (show) list.innerHTML = findListHtml($('#findIn').value);
  else list.innerHTML = '';
  list.hidden = !show;
  $('#findArrow').setAttribute('aria-expanded', String(show));
  $('#findIn').setAttribute('aria-expanded', String(show));
}
function openFind() {
  if (!S.api) return;
  $('#findPanel').hidden = false;
  $('#searchBtn').setAttribute('aria-expanded', 'true');
  $('#findIn').focus();
}
function closeFind() {
  if (!findOpen()) return;
  $('#findPanel').hidden = true;
  $('#searchBtn').setAttribute('aria-expanded', 'false');
  $('#findIn').value = ''; findPinned = false;
  setFindList(false);
}
$('#searchBtn').addEventListener('click', () => { if (findOpen()) closeFind(); else openFind(); });
$('#findArrow').addEventListener('click', () => {
  const show = $('#findList').hidden;
  findPinned = show;
  setFindList(show);
  if (show) $('#findIn').blur();   // put the keyboard away so the whole list can be seen
});
$('#findIn').addEventListener('input', () => {
  const typed = $('#findIn').value.trim() !== '';
  if (typed || findPinned) setFindList(true); else setFindList(false);
});
// A tap anywhere else closes the panel. Only the back and Settings buttons also do their own job, so a tap never presses something by accident.
document.addEventListener('click', (e) => {
  if (!findOpen() || e.target.closest('#findPanel, #searchBtn')) return;
  const through = e.target.closest('#back, #settingsBtn');
  closeFind();
  if (!through) { e.preventDefault(); e.stopPropagation(); }
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && findOpen() && !sheet.open) { closeFind(); $('#searchBtn').focus(); }
});

/* ---------- Files ---------- */
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const byId = () => Object.fromEntries(S.shows.map((s) => [s.id, s]));

function downloadShow(s, onlyShown) {
  const rows = S.rows[s.id] || [];
  if (!rows.length) { toast('Nothing to download yet'); return; }
  const list = C.filterRows(rows, onlyShown ? { filter: S.filter, q: S.q } : {});
  download(`exhibitor-leads-${C.slug(s.name)}-${today()}.csv`, C.toCsv(list, byId()));
  toast(`Saved ${C.plural(list.length, 'exhibitor')} to a CSV file`);
}

async function downloadSector(sector) {
  const shows = S.shows.filter((s) => s.sector === sector);
  let rows;
  try { rows = (await call('rows', { sector })).rows; setOffline(null); }
  catch (e) {
    rows = [];
    shows.forEach((s) => { rows = rows.concat(S.rows[s.id] || cachedRows(s.id)); });
    if (!rows.length) { toast(e.message); return; }
    toast('Could not reach Exhibitor Leads, so this uses what was loaded earlier');
  }
  const merged = C.mergeBySite(C.filterRows(rows, {}), byId());
  download(`exhibitor-leads-${C.slug(sector)}-sector-${today()}.csv`, C.toCsv(merged, byId()));
  toast(`Saved ${C.plural(merged.length, 'business', 'businesses')} to a CSV file`);
}

/* ---------- Actions ---------- */
/** While Apps Script works: the button shows a spinner and cannot be pressed twice. */
async function withBusy(btn, fn) {
  if (btn) { btn.disabled = true; btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true'); }
  try { return await fn(); } finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); } }
}

/**
 * A menu action that asks Apps Script to do something: the menu closes at once and a message with a spinner says what is
 * happening, the answer replaces it, and the lists refresh afterwards without holding anything up.
 */
async function runFromMenu(working, fn) {
  closeSheet();
  busyToast(working);
  try { await fn(); } catch (e) { toast(oldScript(e)); }
}

async function loadList(s, btn) {
  await withBusy(btn, async () => {
    busyToast('Reading the exhibitor list…');
    try {
      const r = await call('loadShow', { id: s.id }, 90000);
      await refreshShows();
      if (r.status === 'loaded') {
        toast(`${C.plural(r.added, 'exhibitor')} added${r.skipped ? `, ${r.skipped} already there` : ''}`);
        await fetchRows(s.id).catch(() => {});
      } else toast(r.note || 'No exhibitors found');
      E.userPaused = false;
      updateShow();
      ensureChecking();
    } catch (e) { setOffline(e); toast(e.message); }
  });
}

async function submitShow(form) {
  const f = new FormData(form), id = form.dataset.id;
  const name = String(f.get('name') || '').trim(), sector = C.matchSector(f.get('sector'), S.shows);
  if (!name) { toast('Give the exhibition a name'); return; }
  if (!sector) { toast('Add a sector, such as Whisky and spirits'); return; }
  const listMode = !id && form.dataset.mode === 'list';
  let urls = [], list = '';
  if (listMode) {
    list = String(f.get('list') || '').trim();
    if (!list) { toast('Paste at least one exhibitor, or choose Link'); return; }
  } else {
    const k = C.linkBoxKind(f.get('urls'));
    if (k.kind === 'list') {
      if (!id && linkBoxToList()) return;   // shown in the list box: one more tap adds it
      toast('That looks like a list of exhibitors. Add it with Paste a list in the exhibition menu'); return;
    }
    if (k.kind === 'bad') { toast(`“${k.bad.length > 40 ? k.bad.slice(0, 40) + '…' : k.bad}” is not a web address. Check it${id ? '' : ', or choose List to paste the exhibitors'}`); return; }
    urls = k.urls;
  }
  const btn = form.querySelector('[type=submit]');
  await withBusy(btn, async () => {
    try {
      let contact; try { contact = !id && form.dataset.contact ? JSON.parse(form.dataset.contact) : undefined; } catch (e) { contact = undefined; }
      const j = await call('saveShow', { id: id || undefined, name, sector, start: f.get('start') || '', end: f.get('end') || '', urls: urls.join('\n'), venue: String(f.get('venue') || '').trim(), contact });
      S.set.lastSector = sector; saveSet();
      // the list goes in with the exhibition, so its checks start at once
      let pasted = null, pasteErr = null;
      if (list) { try { pasted = await call('pasteList', { showId: j.show.id, text: list }); } catch (err) { pasteErr = err; } }
      closeSheet();
      await refreshShows();
      const show = showById(j.show.id) || j.show;
      if (!id) {
        E.userPaused = false;
        go({ v: 'show', showId: show.id, sector: show.sector }, S.route.v === 'diary');   // from the diary: the show takes its place, so up is one step back
        if (pasted) toast(`${C.plural(pasted.added, 'exhibitor')} added${pasted.skipped ? `, ${pasted.skipped} already there` : ''}`);
        else if (pasteErr) toast(`The exhibition was added, but not the list: ${pasteErr.message}. Tap Paste the list to try again`);
        else if (show.urls.length) { await sleep(50); loadList(show, null); } else toast('Added. Paste the list to get started');
      } else { toast('Saved'); if (S.route.v === 'show') { const h = $('#showHero'); if (h) h.dataset.key = ''; updateShow(); } else renderMain(); }
    } catch (e) { setOffline(e); toast(e.message); }
  });
}

function openRenameSector(sector) {
  const n = S.shows.filter((x) => x.sector === sector).length;
  openSheet(`${head('Rename sector')}<form id="renameForm" data-sector="${esc(sector)}" novalidate>
      <label class="lbl" for="rn-name" style="margin-top:6px">Sector name</label>
      <input class="field" id="rn-name" name="name" list="renameList" value="${esc(sector)}" maxlength="40" autocomplete="off">
      <datalist id="renameList">${C.sectorOptions(S.shows).map((o) => `<option value="${esc(o.name)}">`).join('')}</datalist>
      <p class="hint">This changes ${C.plural(n, 'exhibition')}. Choose a name that already exists to join the two sectors together.</p>
      <div class="actions"><button class="btn primary" type="submit">Rename</button><button class="btn" type="button" data-act="close">Cancel</button></div>
    </form>`);
}

async function submitRename(form) {
  const from = form.dataset.sector;
  const to = C.matchSector(new FormData(form).get('name'), S.shows.filter((x) => x.sector !== from));
  if (!to) { toast('Add a sector name'); return; }
  const mine = S.shows.filter((x) => x.sector === from);
  if (to === from || !mine.length) { closeSheet(); return; }
  await withBusy(form.querySelector('[type=submit]'), async () => {
    try {
      for (const x of mine) await call('saveShow', { id: x.id, name: x.name, sector: to, start: x.start || '', end: x.end || '', urls: (x.urls || []).join('\n') });
      closeSheet();
      await refreshShows();
      S.set.lastSector = to; saveSet();
      try { const j = await call('saveSearch', { from, to }); S.searches = j.searches || S.searches; put('searches', S.searches); } catch (e) { /* an older Apps Script: the pages stay under the old name */ }
      S.route = { v: 'sector', sector: to };
      history.replaceState({ r: S.route, prev: (history.state || {}).prev || null }, '');
      renderMain();
      toast(`Renamed to ${to}`);
    } catch (e) { await refreshShows(); renderMain(); setOffline(e); toast(e.message); }
  });
}

async function act(name, t) {
  const d = t.dataset, s = showById(S.route.showId);
  switch (name) {
    case 'close': closeSheet(); break;
    case 'back': if (!goUp()) history.back(); break;
    case 'settings': openSettings(); break;
    case 'hide-usage': S.usageHidden = usageKey(); renderNotices(); break;
    case 'retry': {
      const ok = await refreshShows();
      if (S.route.v === 'show') { await fetchRows(S.route.showId).then(() => setOffline(null)).catch((e) => setOffline(e)); loadPipe(S.route.showId, true); updateShow(); ensureChecking(); }
      toast(ok ? 'Back online' : 'Still cannot reach Exhibitor Leads');
      break;
    }
    case 'reboot': boot(); break;
    case 'go': if (s) openGo(s); break;
    case 'pipe-retry': if (s) loadPipe(s.id); break;
    case 'open-checks': { const sh = showById(d.id); if (sh) { go({ v: 'show', showId: sh.id, sector: sh.sector }); S.filter = 'pipe-check'; updateShow(); } break; }
    case 'pipe-down': {
      const r = rowById(d.id);
      if (!r) break;
      await withBusy(t, async () => {
        try { await setCanEmail(r, 'Consent needed', 'Yes (Ltd)'); updateShow(); openRow(r.id); }
        catch (e) { toast(e.message); }
      });
      break;
    }
    case 'pipe-yes': case 'pipe-consent': case 'pipe-yes-sure': {
      const r = rowById(d.id);
      if (!r) break;
      // Exhibitor Leads hasn't confirmed a limited company: say so before the pipeline treats them as one
      if (name === 'pipe-yes' && C.statusOf(r) !== 'corporate') {
        openConfirm('Email them as a limited company?', `Exhibitor Leads hasn’t confirmed a limited company for ${r.name}. Only choose this if you’ve checked Companies House yourself: sole traders and partnerships can’t be cold-emailed.`, 'pipe-yes-sure', 'Yes, it’s a limited company', r.id);
        break;
      }
      await withBusy(t, async () => {
        try { await setCanEmail(r, name === 'pipe-consent' ? 'Consent needed' : 'Yes (Ltd)', 'Check'); updateShow(); openRow(r.id); }
        catch (e) { toast(e.message); }
      });
      break;
    }
    case 'add-show': openAddShow(S.shared ? S.shared : null); S.shared = null; break;
    case 'open-search': openFind(); break;
    case 'diary': if (S.route.v === 'sector') { if (S.diaryFor !== S.route.sector) { S.diaryQ = ''; S.diaryType = 'all'; S.diaryFor = S.route.sector; } go({ v: 'diary', sector: S.route.sector }); } break;
    case 'diary-type': S.diaryType = d.type || 'all'; renderMain(); break;
    case 'attendance': openAttendance(d.i === 'show' ? showDiaryEntry(s) : diaryEntry(d.i)); break;
    case 'find-organiser': if (s) await findOrganiser(s, t); break;
    case 'clear-organiser': if (s) await clearOrganiser(s, t); break;
    case 'diary-add': { const e = diaryEntry(d.i); if (e) openAddShow(Object.assign(C.diaryPrefill(e, S.route.sector), { diary: true })); break; }
    case 'rename-sector': if (S.route.v === 'sector') openRenameSector(S.route.sector); break;
    case 'sector-csv': withBusy(t, () => downloadSector(S.route.sector)); break;
    case 'show-menu': if (s) openShowMenu(s); break;
    case 'edit-show': if (s) openEditShow(s); break;
    case 'paste': if (s) openPaste(s); break;
    case 'load': if (s) { closeSheet(); loadList(s, t); } break;
    case 'csv': if (s) downloadShow(s, false); break;
    case 'csv-shown': if (s) { closeSheet(); downloadShow(s, true); } break;
    case 'pause': E.stop = true; E.userPaused = true; updateShow(); if (S.route.v !== 'show') renderMain(); toast('Paused. The background checks carry on.'); break;
    case 'resume':
      E.userPaused = false;
      // paused a moment ago and the last step is still finishing: just carry on with it
      if (E.running) { E.stop = false; if (S.route.v === 'show') updateShow(); else renderMain(); break; }
      if (S.route.v === 'show') { if (s) runChecks(s.id); } else runAllChecks();
      break;
    case 'more': S.limit += 200; updateShow(); break;
    case 'add-search': openAddSearch(S.route.v === 'sector' ? S.route.sector : (S.set.lastSector || '')); break;
    case 'add-show-blank': closeSheet(); openAddShow(null); break;
    case 'save-listing': { const f = $('#showForm'); openAddSearch(f ? C.matchSector(f.sector.value, S.shows) || f.sector.value : '', { url: d.url, shared: true, host: (/^https?:\/\/(?:www\.)?([^\/?#]+)/i.exec(d.url) || [])[1] }); break; }
    case 'remove-search': if (S.route.v === 'sector') {
      await withBusy(t, async () => {
        try { const j = await call('saveSearch', { sector: S.route.sector, url: d.url, remove: true }); S.searches = j.searches || {}; put('searches', S.searches); renderMain(); toast('Search page removed'); } catch (e) { toast(oldScript(e)); }
      });
    } break;
    case 'sf-mode': setShowMode(t.dataset.mode); if (t.dataset.mode === 'list') linkBoxToList(); break;
    case 'open-sheet': if (S.status && S.status.sheetUrl) window.open(S.status.sheetUrl, '_blank', 'noopener'); break;
    case 'delete-show': if (s) openConfirm('Delete this exhibition?', `${s.name} and its exhibitors will be removed from your sheet. This cannot be undone.`, 'delete-show-yes', 'Delete exhibition', s.id); break;
    case 'delete-show-yes': {
      await withBusy(t, async () => {
        try { await call('deleteShow', { id: d.id }); delete S.rows[d.id]; drop('rows.' + d.id); closeSheet(); S.shows = S.shows.filter((x) => x.id !== d.id); put('shows', S.shows); toast('Exhibition deleted'); history.back(); }
        catch (e) { toast(e.message); }
      });
      break;
    }
    case 'confirm-likely': if (s) {
      const n = C.countRows(S.rows[s.id] || []).likely;
      await runFromMenu(`Confirming ${C.plural(n, 'likely match', 'likely matches')}…`, async () => {
        const j = await call('confirmLikely', { showId: s.id });
        mergeRows(s.id, j.changed); updateShow(); toast(`${C.plural((j.changed || []).length, 'match', 'matches')} confirmed`);
        refreshStatus().catch(() => {});
      });
    } break;
    case 'recheck-weak': if (s) {
      const n = C.countRows(S.rows[s.id] || []).check;
      await runFromMenu(`Checking ${C.plural(n, 'business', 'businesses')} again…`, async () => {
        const j = await call('recheckWeak', { showId: s.id });
        await fetchRows(s.id);   // the spinner stays until the list shows them waiting again
        E.userPaused = false; updateShow(); ensureChecking();
        toast(j.queued ? `Checking ${C.plural(j.queued, 'business', 'businesses')} again` : 'Nothing to check again');
        refreshStatus().catch(() => {});
      });
    } break;
    case 'recheck-weak-all': case 'recheck-weak-consent-yes': {
      await runFromMenu(name === 'recheck-weak-all' ? 'Putting the “to check” ones back in the queue…' : 'Putting “to check” and “consent needed” back in the queue…', async () => {
        const j = await call('recheckWeak', name === 'recheck-weak-all' ? {} : { include: 'all' });
        if (S.route.v === 'show') await fetchRows(S.route.showId); else await refreshShows();   // the spinner stays until the screen shows the change
        E.userPaused = false;
        if (S.route.v === 'show') { updateShow(); ensureChecking(); } else renderMain();
        toast(j.queued ? `Checking ${C.plural(j.queued, 'business', 'businesses')} again. Open an exhibition to watch it` : 'Nothing to check again');
        Promise.all([S.route.v === 'show' ? refreshShows() : null, refreshStatus()]).catch(() => {});
      });
      break;
    }
    case 'recheck-weak-consent': openConfirm('Include “consent needed” too?', 'These are mostly sole traders and businesses with no company on the register, so rechecking them rarely changes anything. It does use a lot of web requests. Businesses you confirmed are kept.', 'recheck-weak-consent-yes', 'Check them again'); break;
    case 'recheck-all': if (s) {
      const ids = (S.rows[s.id] || []).map((r) => r.id);
      await runFromMenu(`Checking all ${C.plural(ids.length, 'business', 'businesses')} again…`, async () => {
        await call('recheck', { ids });
        await fetchRows(s.id);
        E.userPaused = false; updateShow(); ensureChecking();
        toast('Checking everything again');
      });
    } break;
    case 'match-yes': case 'match-no': {
      await withBusy(t, async () => {
        try { const j = await call('confirmMatch', { id: d.id, yes: name === 'match-yes' }); mergeRows(S.route.showId, [j.row]); updateShow(); openRow(d.id); toast(name === 'match-yes' ? 'Confirmed as the same company' : 'Marked as no company'); followConfirm(j.row); }
        catch (e) { toast(e.message); }
      });
      break;
    }
    case 'company-no': openCompanyNo(d.id); break;
    case 'find-co': openPicker(d.id); break;
    case 'pick-co': openPickConfirm(+d.i); break;
    case 'pick-back': if (S.pick) openPicker(S.pick.id, S.pick); break;
    case 'pick-yes': {
      const p = S.pick || {}, c = (p.items || [])[+d.i];
      if (!c) break;
      await withBusy(t, async () => {
        try { const j = await call('confirmMatch', { id: p.id, number: c.no }); mergeRows(S.route.showId, [j.row]); updateShow(); openRow(p.id); toast('Company confirmed'); followConfirm(j.row); }
        catch (e) { toast(e.message); }
      });
      break;
    }
    case 'copy-text': {
      const ok = await copyText(d.text || '');
      toast(ok ? `${d.what || 'Text'} copied` : 'Could not copy. Press and hold the number to select it');
      if (ok) { t.classList.add('done'); t.innerHTML = ICON.tick; setTimeout(() => { if (t.isConnected) { t.classList.remove('done'); t.innerHTML = ICON.copy; } }, 1400); }
      break;
    }
    case 'back-to-row': openRow(d.id); break;
    case 'explain-row': {
      await withBusy(t, async () => {
        toast('Checking again without saving. This takes about 10 seconds');
        try { const j = await call('explain', { id: d.id }, 100000); openExplain(d.id, j); }
        catch (e) { toast(oldScript(e)); }
      });
      break;
    }
    case 'notify-setup': await withBusy(t, openNotifySetup); break;
    case 'notify-test': {
      await withBusy(t, async () => {
        showNotifyResult('Sending…');
        try {
          await call('testNotify', null, 30000);
          const at = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date());
          showNotifyResult(`Sent at ${at}. It should reach ntfy within a minute. If it does not, look in your Gmail inbox for a bounce message.`);
          rememberNotify(true);
          toast('Test sent. It should arrive in ntfy within a minute');
        } catch (e) { showNotifyResult(oldScript(e), true); toast(oldScript(e)); rememberNotify(false, oldScript(e)); }
      });
      break;
    }
    case 'notify-off': {
      await withBusy(t, async () => {
        try {
          await call('setNotify', { off: true });
          S.status = Object.assign({}, S.status, { notify: { on: false, topic: '', click: false } }); put('status', S.status);
          const nb = $('#notifyBox'); if (nb) nb.outerHTML = notifyHtml();
          toast('Notifications are off');
        } catch (e) { toast(oldScript(e)); }
      });
      break;
    }
    case 'copy-topic': toast((await copyText(d.text || '')) ? 'Code copied' : 'Could not copy. Press and hold the code to select it'); break;
    case 'copy-why': toast((await copyText(S.whyText || '')) ? 'Copied' : 'Could not copy. Press and hold the text to select it'); break;
    case 'edit-row': openEditRow(d.id); break;
    case 'recheck': {
      await withBusy(t, async () => {
        try { await call('recheck', { ids: [d.id] }); await fetchRows(S.route.showId); closeSheet(); E.userPaused = false; updateShow(); ensureChecking(); toast('Checking this business again'); }
        catch (e) { toast(e.message); }
      });
      break;
    }
    case 'remove-row': openConfirm('Remove this business?', 'It will be removed from this exhibition in your sheet.', 'remove-row-yes', 'Remove', d.id); break;
    case 'remove-row-yes': {
      await withBusy(t, async () => {
        try {
          await call('deleteRows', { ids: [d.id] });
          const id = S.route.showId;
          S.rows[id] = (S.rows[id] || []).filter((r) => r.id !== d.id);
          saveRows(id); syncCounts(id); closeSheet(); updateShow(); toast('Removed');
        } catch (e) { toast(e.message); }
      });
      break;
    }
  }
}

/* ---------- Events ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  const d = t.dataset;
  if (d.chrome && isAndroid && standalone && /^https?:/.test(t.href)) { e.preventDefault(); location.href = C.chromeIntent(t.href); return; }
  if (d.sector) { closeFind(); go({ v: 'sector', sector: C.matchSector(d.sector, S.shows) }); return; }
  if (d.show) { const s = showById(d.show); if (s) go({ v: 'show', showId: s.id, sector: s.sector }, S.route.v === 'diary'); return; }
  if (d.row) { openRow(d.row); return; }
  if (d.filter) { S.filter = d.filter; S.limit = 200; updateShow(); return; }
  if (d.act) act(d.act, t);
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'findForm') {
    const r = C.resolveSector($('#findIn').value, S.shows);
    if (!r.sector) {
      findPinned = true; $('#findIn').blur(); setFindList(true);
      toast(r.matches.length ? 'Choose one from the list, or keep typing' : 'Type a sector, or choose one from the list');
      return;
    }
    S.set.lastSector = r.sector; saveSet();
    closeFind();
    go({ v: 'sector', sector: r.sector });
  } else if (f.id === 'renameForm') submitRename(f);
  else if (f.id === 'goForm') submitGo(f);
  else if (f.id === 'showForm') submitShow(f);
  else if (f.id === 'searchForm') {
    const sector = C.matchSector(f.sector.value, S.shows) || String(f.sector.value || '').trim();
    const url = C.validUrl(f.url.value.trim());
    if (!url) { toast('Paste the page address, starting https://'); return; }
    if (!sector) { toast('Choose a sector for it'); return; }
    await withBusy(f.querySelector('[type=submit]'), async () => {
      try {
        const j = await call('saveSearch', { sector, url, label: f.label.value.trim() });
        S.searches = j.searches || {}; put('searches', S.searches);
        closeSheet(); if (S.route.v === 'sector') renderMain();
        toast(`Saved under Find exhibitions for ${sector}`);
      } catch (err) { toast(oldScript(err)); }
    });
  } else if (f.id === 'pasteForm') {
    const text = f.text.value.trim();
    if (!text) { toast('Paste at least one name'); return; }
    await withBusy(f.querySelector('[type=submit]'), async () => {
      try {
        const r = await call('pasteList', { showId: f.dataset.id, text });
        closeSheet(); await refreshShows(); await fetchRows(f.dataset.id).catch(() => {});
        E.userPaused = false; updateShow(); ensureChecking();
        toast(`${C.plural(r.added, 'exhibitor')} added${r.skipped ? `, ${r.skipped} already there` : ''}`);
      } catch (err) { toast(err.message); }
    });
  } else if (f.id === 'editRowForm') {
    const patch = {};
    ['contact', 'email', 'phone', 'website', 'note'].forEach((k) => { patch[k] = f[k].value.trim(); });
    await withBusy(f.querySelector('[type=submit]'), async () => {
      try {
        const j = await call('editRow', { id: f.dataset.id, patch });
        mergeRows(S.route.showId, [j.row]);
        closeSheet(); updateShow(); toast('Saved');
        E.userPaused = false; ensureChecking();
      } catch (err) { toast(err.message); }
    });
  } else if (f.id === 'companyForm') {
    await withBusy(f.querySelector('[type=submit]'), async () => {
      try {
        const j = await call('confirmMatch', { id: f.dataset.id, number: f.number.value });
        mergeRows(S.route.showId, [j.row]); updateShow(); openRow(f.dataset.id); toast('Company confirmed'); followConfirm(j.row);
      } catch (err) { toast(err.message); }
    });
  } else if (f.id === 'pickForm') {
    const q = f.q.value.trim();
    if (q.length < 2) { toast('Type at least two letters, or the company number'); return; }
    S.pick = { id: f.dataset.id, q, items: null, err: '' };
    const mine = S.pick;
    await withBusy(f.querySelector('[type=submit]'), async () => {
      try { const j = await call('searchCompanies', { q }, 30000); mine.items = j.items || []; }
      catch (err) { mine.err = oldScript(err); }
      const box = $('#pickList');
      if (box && S.pick === mine && $('#pickForm')) box.innerHTML = pickListHtml();
    });
  } else if (f.id === 'searchForm') { /* search happens as you type */ }
});

let qTimer;
document.addEventListener('input', (e) => {
  // a list pasted into the link box of a new exhibition moves to the list box (typing a link never does)
  if (e.target.id === 'sf-urls') {
    const ta = e.target, grew = ta.value.length - (+ta.dataset.len || 0);
    const sf = $('#showForm');
    if (sf && !sf.dataset.id && sf.dataset.contact) { sf.dataset.contact = ''; const lo = $('#sf-look .look-org'); if (lo) lo.remove(); }   // the link changed: its contact went with it
    ta.dataset.len = ta.value.length;
    if (/^insertFromPaste|^insertFromDrop/.test(e.inputType || '') || grew > 15) {
      if (!linkBoxToList()) { const k = C.linkBoxKind(ta.value); if (k.kind === 'links' && k.urls.length === 1) lookUp(k.urls[0]); }
    }
    return;
  }
  if (e.target.id === 'dq') { S.diaryQ = e.target.value; applyDiaryQ(); return; }
  if (e.target.id !== 'q') return;
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { S.q = e.target.value; S.limit = 200; updateShow(); }, 150);
});

$('#settingsBtn').addEventListener('click', () => openSettings());
window.addEventListener('online', () => { if (S.offline) act('retry', document.body); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.api) return;
  if (S.route.v === 'show') {
    const id = S.route.showId;
    fetchRows(id).then(() => { updateShow(); ensureChecking(); }).catch((e) => setOffline(e));
    if (Date.now() - ((S.pipe[id] || {}).at || 0) > 60000) loadPipe(id, true);
  } else refreshShows().then(() => ensureChecking());
});

/* ---------- Start ---------- */
/** A notification's link, #show=<id>: open that exhibition. Also works when the app is already open and only the link changes. */
function openShowLink(id) {
  const s = S.api && showById(id);
  if (!s) return false;
  go({ v: 'show', showId: s.id, sector: s.sector });
  return true;
}
window.addEventListener('hashchange', () => {
  const id = C.showFromHash(location.hash);
  if (!id) return;
  history.replaceState(history.state, '', location.pathname + location.search);
  if (!openShowLink(id) && S.api) refreshShows().then(() => openShowLink(id));
});

/** Your HQ sign-in, then HQ says where Exhibitor Leads is (EL_URL), then the exhibitions. */
async function connectEl() {
  S.boot = 'starting'; S.api = null; render();
  let h;
  try { h = await HQ.call('hello', null, 30000); }
  catch (e) { if (S.boot !== 'signin') { S.boot = 'error'; S.bootMsg = e.message; render(); } return; }
  if ((+h.build || 0) < 7) { S.boot = 'error'; S.bootMsg = `Your HQ script is release ${+h.build || 'older than 7'}. Paste HQ’s new Code.gs and deploy a new version (release 7), then try again.`; render(); return; }
  if (!h.elUrl) { S.boot = 'noel'; render(); return; }
  S.api = { url: h.elUrl };
  S.boot = 'ready';
  render();
  checkBuild();
  const ok = await refreshShows();
  if (!ok && !S.shows.length) { S.api = null; S.boot = 'error'; S.bootMsg = S.offlineMsg || 'Exhibitor Leads didn’t answer.'; render(); return; }
  loadChecks();
  if (S.shared) { const p = S.shared; S.shared = null; openAddShow(p); }
  if (S.openShow) { const id = S.openShow; S.openShow = null; openShowLink(id); }
  else ensureChecking();
}
async function boot() {
  const state = await HQ.init();
  if (state === 'ready') connectEl(); else { S.boot = state; render(); }
}

function start() {
  if (window.top !== window.self) { document.body.textContent = 'Showsum HQ can’t be opened inside another page.'; return; }
  try { history.scrollRestoration = 'manual'; } catch {}
  const top = $('#top');
  const edge = () => top.classList.toggle('scrolled', window.scrollY > 2);
  window.addEventListener('scroll', edge, { passive: true }); edge();
  setTheme(S.set.theme);
  saveSet();
  // A page shared from another app arrives as ?title=&text=&url=
  const q = new URLSearchParams(location.search);
  if (q.has('url') || q.has('text') || q.has('title')) {
    const p = C.parseShared({ title: q.get('title'), text: q.get('text'), url: q.get('url') });
    history.replaceState(null, '', location.pathname);
    if (p.url || p.name) S.shared = p;
  }
  // A notification links here with #show=<id>: open that exhibition once the list is loaded
  const hashShow = C.showFromHash(location.hash);
  if (hashShow) { S.openShow = hashShow; history.replaceState(null, '', location.pathname + location.search); }
  history.replaceState({ r: S.route }, '');
  render();
  boot().catch((e) => { S.boot = 'error'; S.bootMsg = e.message; render(); });
}
try { start(); } catch (err) { document.getElementById('main').innerHTML = LOAD_FAIL; }
})();
