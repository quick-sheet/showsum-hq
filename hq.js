/* Showsum HQ · app (release 1: shell, sign-in, Launchpad, Settings) */
(function () {
  'use strict';

  var APP_VERSION = 1;       // bump with hq.js?v= / hq.css?v= in index.html and the cache name in sw.js
  var EXPECT_BUILD = 1;      // the HQ Apps Script release this app expects
  var LS = { config: 'hq.config', links: 'hq.links', user: 'hq.user' };
  var SS_TOKEN = 'hq.idToken';
  var GSI_SRC = 'https://accounts.google.com/gsi/client';
  var URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  var CLIENT_RE = /^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/;
  var LINK_RE = /^https:\/\/[^\s"'<>]+$/i;
  var TILE_COLOURS = ['#ffd23f', '#7ee0a1', '#8fc7ff', '#b49bff', '#ff6fa0', '#2fd6c3'];
  var SETUP = window.HQ_SETUP || {};
  var FIXED_CLIENT = CLIENT_RE.test(SETUP.clientId || '') ? SETUP.clientId : '';
  var PIN = /^[A-Za-z0-9_-]{22}$/.test(SETUP.scriptPin || '') ? SETUP.scriptPin : '';

  var S = {
    config: null, token: null, claims: null, user: null, links: null, props: null, status: null, statusErr: '',
    build: null, route: 'overview', editing: false, draft: null, offline: false, refused: false, pin: '',
    gsi: null, waiters: [], installEvt: null, banner: '', busy: {}
  };

  // ------------------------------------------------------------------------------------------------ icons
  function svg(body, extra) {
    return '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + body + '</svg>';
  }
  var I = {
    overview: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    sectors: svg('<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="m2 13 10 5 10-5"/><path d="m2 17.5 10 5 10-5"/>'),
    inbox: svg('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3.5-7Z"/>'),
    customers: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.6 5.2"/>'),
    launchpad: svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/>'),
    settings: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    out: svg('<path d="M7 17 17 7M9 7h8v8"/>'),
    up: svg('<path d="m6 15 6-6 6 6"/>'),
    down: svg('<path d="m6 9 6 6 6-6"/>'),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
    bin: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    share: svg('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    signout: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>'),
    send: svg('<path d="m4 12 16-8-6 16-2.5-6.5L4 12Z"/>'),
    download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>')
  };

  var NAV = [
    ['overview', 'Overview', I.overview],
    ['sectors', 'Sectors', I.sectors],
    ['inbox', 'Inbox', I.inbox],
    ['customers', 'Customers', I.customers],
    ['launchpad', 'Launchpad', I.launchpad],
    ['settings', 'Settings', I.settings]
  ];

  // ------------------------------------------------------------------------------------------------ helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } }
  function hostOf(u) { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } }
  function b64urlEncode(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64urlDecode(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }
  function jwtClaims(t) {
    try { return JSON.parse(b64urlDecode(String(t).split('.')[1])); } catch (e) { return null; }
  }
  function tokenOk(t, marginSec) {
    var c = jwtClaims(t);
    return !!(c && c.exp && c.exp * 1000 > Date.now() + (marginSec || 0) * 1000);
  }
  function validConfig(c) { return !!(c && URL_RE.test(c.url || '') && CLIENT_RE.test(c.clientId || '')); }
  /** A fingerprint of the script address: the first 22 characters of its SHA-256, base64url. */
  function pinOf(url) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)).then(function (buf) {
      var bin = '', bytes = new Uint8Array(buf);
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 22);
    });
  }
  function firstInitial() {
    var n = (S.user && S.user.name) || (S.claims && S.claims.name) || '';
    return n ? n.trim().charAt(0).toUpperCase() : 'G';
  }
  function maskUrl(u) {
    var m = /\/s\/([A-Za-z0-9_-]+)\/exec$/.exec(u || '');
    return m ? 'script.google.com/macros/s/' + m[1].slice(0, 6) + '…' + m[1].slice(-4) + '/exec' : '';
  }
  function nowLine() {
    var d = new Date();
    var days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    var mons = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + mons[d.getMonth()] + ' · ' + hh + ':' + mm;
  }
  function greeting() {
    var h = new Date().getHours();
    return (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ', ' + firstInitial();
  }
  function uid() { return Math.random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, 'x').padEnd(10, 'x'); }

  function toast(msg, bad) {
    var box = $('#toasts');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.setAttribute('role', bad ? 'alert' : 'status');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, bad ? 6000 : 3200);
  }

  function HqError(message, kind) { this.message = message; this.kind = kind; }

  // ------------------------------------------------------------------------------------------------ Google sign-in
  function loadGsi() {
    if (S.gsi) return S.gsi;
    S.gsi = new Promise(function (resolve, reject) {
      if (window.google && google.accounts && google.accounts.id) return resolve();
      var s = document.createElement('script');
      s.src = GSI_SRC; s.async = true; s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { S.gsi = null; reject(new HqError('Google sign-in didn’t load. Check you’re online.', 'network')); };
      document.head.appendChild(s);
    }).then(function () {
      google.accounts.id.initialize({
        client_id: S.config.clientId,
        callback: onCredential,
        auto_select: true,
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true,
        itp_support: true,
        context: 'signin'
      });
    });
    return S.gsi;
  }

  function onCredential(resp) {
    var t = resp && resp.credential;
    if (!t || !tokenOk(t, 30)) { toast('That sign-in didn’t work. Try again.', true); return; }
    S.token = t;
    S.claims = jwtClaims(t);
    S.refused = false;
    sset(SS_TOKEN, t);
    var w = S.waiters; S.waiters = [];
    if (w.length) { setBanner(''); w.forEach(function (fn) { fn.resolve(); }); return; }
    startApp();
  }

  /** Get a fresh sign-in without leaving the page. Resolves when a new token arrives. */
  function reauth() {
    return new Promise(function (resolve, reject) {
      S.waiters.push({ resolve: resolve, reject: reject });
      var timer = setTimeout(function () {
        S.waiters = S.waiters.filter(function (w) { return w.resolve !== resolve; });
        reject(new HqError('signin', 'signin'));
      }, 90000);
      var done = resolve;
      resolve = function () { clearTimeout(timer); done(); };
      S.waiters[S.waiters.length - 1].resolve = resolve;
      loadGsi().then(function () {
        try {
          google.accounts.id.prompt(function (n) {
            var shown = n && typeof n.isDisplayed === 'function' ? n.isDisplayed() : true;
            var skipped = n && typeof n.isSkippedMoment === 'function' && n.isSkippedMoment();
            var notShown = n && typeof n.isNotDisplayed === 'function' && n.isNotDisplayed();
            if (notShown || skipped || !shown) showSigninBanner();
          });
        } catch (e) { showSigninBanner(); }
      }, function () { showSigninBanner(); });
    });
  }

  function showSigninBanner() {
    setBanner('signin');
  }

  function signOut() {
    var done = function () {
      try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
      S.token = null; S.claims = null; S.user = null; S.links = null; S.status = null;
      sset(SS_TOKEN, null);
      store(LS.user, null); store(LS.links, null);
      renderSignin();
    };
    // End the sign-in on the server too, so it can't be reused even if it were copied. Don't wait long.
    if (S.token && tokenOk(S.token, 10)) {
      var t = setTimeout(done, 4000), once = false;
      var fin = function () { if (!once) { once = true; clearTimeout(t); done(); } };
      call('signout', {}, { timeout: 4000, noReauth: true }).then(fin, fin);
    } else done();
  }

  // ------------------------------------------------------------------------------------------------ talking to the HQ script
  function call(action, data, opts) {
    opts = opts || {};
    var ready = (S.token && tokenOk(S.token, opts.noReauth ? 0 : 60)) ? Promise.resolve() : (opts.noReauth ? Promise.reject(new HqError('signin', 'signin')) : reauth());
    return ready.then(function () {
      var ctl = new AbortController();
      var timer = setTimeout(function () { ctl.abort(); }, opts.timeout || 60000);
      var body = JSON.stringify(Object.assign({ action: action, idToken: S.token }, data || {}));
      return fetch(S.config.url, { method: 'POST', body: body, signal: ctl.signal, redirect: 'follow', credentials: 'omit' })
        .then(function (r) {
          clearTimeout(timer);
          return r.json().catch(function () {
            throw new HqError('Your HQ script sent something HQ couldn’t read. Check it’s deployed as a web app that Anyone can use.', 'bad');
          });
        }, function () {
          clearTimeout(timer);
          throw new HqError(navigator.onLine === false ? 'You’re offline.' : 'Couldn’t reach your HQ script.', 'network');
        })
        .then(function (j) {
          if (j && j.build != null) S.build = j.build;
          if (j && j.error === 'signin') {
            if (!opts.retried && !opts.noReauth && !tokenOk(S.token, 300)) {
              return reauth().then(function () { return call(action, data, Object.assign({}, opts, { retried: true })); });
            }
            throw new HqError('signin', 'signin');
          }
          if (j && j.error === 'retry') throw new HqError(j.message || 'Try again in a moment.', 'retry');
          if (!j || j.error) throw new HqError((j && j.error) || 'Something went wrong.', 'server');
          return j;
        });
    });
  }

  // ------------------------------------------------------------------------------------------------ start up
  function boot() {
    if (window.top !== window.self) { document.body.textContent = 'Showsum HQ can’t be opened inside another page.'; return; }
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvt = e; if (S.route === 'settings') renderRoute(); });
    window.addEventListener('hashchange', onHash);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline use just won't be available */ });
    }
    var link = readConnectLink();
    S.config = load(LS.config);
    if (S.config && FIXED_CLIENT) S.config.clientId = FIXED_CLIENT;
    var checks = [S.config && URL_RE.test(S.config.url || '') ? pinOf(S.config.url) : Promise.resolve(''),
      link ? pinOf(link.url) : Promise.resolve('')];
    Promise.all(checks).then(function (pins) {
      S.pin = pins[0];
      if (S.config && PIN && pins[0] !== PIN) {
        forgetConnection();
        return renderConnect(null, 'HQ is locked to a different script now. Connect to that one.');
      }
      if (link) {
        if (!PIN) return renderConnect(null, 'Links only work once HQ is pinned to your script (config.js). Enter the address instead.');
        if (pins[1] !== PIN) return renderConnect(null, 'That link wasn’t for your HQ script, so HQ ignored it.');
        if (FIXED_CLIENT) link.clientId = FIXED_CLIENT;
        if (validConfig(S.config) && S.config.url === link.url) { /* already connected to it */ }
        else return renderConnect(link);
      }
      if (!validConfig(S.config)) return renderConnect();
      var t = sget(SS_TOKEN);
      if (t && tokenOk(t, 60)) { S.token = t; S.claims = jwtClaims(t); startApp(); loadGsi().catch(function () {}); return; }
      renderSignin();
    }, function () {
      document.body.textContent = 'Showsum HQ needs a secure (https) address.';
    });
  }

  function forgetConnection() {
    [LS.config, LS.links, LS.user].forEach(function (k) { store(k, null); });
    sset(SS_TOKEN, null);
    S.config = null; S.token = null; S.user = null; S.links = null; S.status = null; S.gsi = null; S.pin = '';
  }

  function readConnectLink() {
    var m = /^#connect=([A-Za-z0-9_-]+)$/.exec(location.hash || '');
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      var c = JSON.parse(b64urlDecode(m[1]));
      if (c && URL_RE.test(c.u || '') && (!c.c || CLIENT_RE.test(c.c))) return { url: c.u, clientId: c.c || FIXED_CLIENT };
    } catch (e) { /* not a connect link */ }
    return null;
  }

  function startApp() {
    S.route = routeFromHash();
    S.user = S.user || load(LS.user);
    S.links = S.links || load(LS.links);
    renderShell();
    renderRoute();
    call('hello').then(function (j) {
      S.offline = false;
      S.user = j.user; store(LS.user, j.user);
      S.props = j.props;
      if (!S.editing) { S.links = j.links; store(LS.links, j.links); }
      renderShell(); renderRoute();
    }, function (e) {
      if (e.kind === 'signin') return refused();
      if (e.kind === 'network' && (S.links || S.user)) { S.offline = true; setBanner('offline'); renderRoute(); return; }
      setBanner('error:' + e.message);
    });
    if (!S.tick) S.tick = setInterval(keepSignedIn, 60000);
  }

  function keepSignedIn() {
    if (document.hidden || !S.token || S.waiters.length) return;
    if (!tokenOk(S.token, 300)) reauth().catch(function () { /* banner already offers a button */ });
  }

  function refused() {
    S.refused = true;
    var email = (S.claims && S.claims.email) || 'that account';
    try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
    S.token = null; sset(SS_TOKEN, null); store(LS.user, null); store(LS.links, null); S.user = null; S.links = null;
    renderSignin('Your HQ script turned away ' + email + '. HQ only opens for the account in ALLOWED_EMAIL, signed in to this app’s client ID (HQ_CLIENT_ID).');
  }

  // ------------------------------------------------------------------------------------------------ gate screens
  function brand() {
    return '<div class="brand"><div class="mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div><b>Showsum HQ</b></div>';
  }

  function renderConnect(prefill, notice) {
    document.title = 'Connect · Showsum HQ';
    var c = prefill || S.config || {};
    $('#app').innerHTML =
      '<main class="gate"><form class="gate-card" id="connect" novalidate>' + brand() +
      '<div><h1 class="h2">Connect HQ</h1><p class="lede" style="margin-top:6px">' + (FIXED_CLIENT ? 'Your HQ script’s address, entered once on each device.' : 'Two things from your HQ setup, entered once on each device.') + '</p></div>' +
      (prefill ? '<p class="banner" style="margin:0">Filled in from your link. Check and connect.</p>' : '') +
      (notice ? '<p class="banner" style="margin:0" role="status">' + esc(notice) + '</p>' : '') +
      '<div class="field"><label for="c-url">HQ script address</label>' +
      '<input class="input mono" id="c-url" name="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(c.url || '') + '">' +
      '<span class="hint">Apps Script → Deploy → Manage deployments → Web app address.</span></div>' +
      (FIXED_CLIENT ? '' : '<div class="field"><label for="c-id">Google sign-in client ID</label>' +
      '<input class="input mono" id="c-id" name="clientId" autocomplete="off" spellcheck="false" placeholder="1234…apps.googleusercontent.com" value="' + esc(c.clientId || '') + '">' +
      '<span class="hint">Google Cloud → Google Auth Platform → Clients → Showsum HQ.</span></div>') +
      '<p class="error" id="c-err" role="alert" hidden></p>' +
      '<button class="btn yellow" type="submit" id="c-go">Connect</button>' +
      '<p class="note">Neither of these is a password. HQ still only opens for your own Google account.</p>' +
      '</form></main><div class="toasts" id="toasts"></div>';
    $('#connect').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var url = $('#c-url').value.trim(), id = FIXED_CLIENT || $('#c-id').value.trim();
      var err = $('#c-err');
      err.hidden = true;
      if (!URL_RE.test(url)) { err.textContent = 'The address should start https://script.google.com/macros/s/ and end /exec.'; err.hidden = false; $('#c-url').focus(); return; }
      if (!CLIENT_RE.test(id)) { err.textContent = 'The client ID ends .apps.googleusercontent.com.'; err.hidden = false; $('#c-id').focus(); return; }
      var btn = $('#c-go');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Checking';
      var pin = '';
      pinOf(url).then(function (p) {
        pin = p;
        if (PIN && p !== PIN) throw new HqError('That address isn’t your HQ script. HQ only connects to the script pinned in config.js.');
        return ping(url);
      }).then(function (j) {
        var changed = !S.config || S.config.url !== url || S.config.clientId !== id;
        if (changed) forgetConnection();
        S.config = { url: url, clientId: id };
        S.pin = pin;
        store(LS.config, S.config);
        S.build = j.build;
        renderSignin();
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = 'Connect';
        err.textContent = e.message; err.hidden = false;
      });
    });
  }

  function ping(url) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 30000);
    return fetch(url, { method: 'GET', redirect: 'follow', credentials: 'omit', signal: ctl.signal })
      .then(function (r) { clearTimeout(timer); return r.json(); }, function () { clearTimeout(timer); throw new HqError('That address didn’t answer. Check it, and that the script is deployed as a web app that Anyone can use.'); })
      .then(function (j) {
        if (!j || j.app !== 'Showsum HQ') throw new HqError('That address answered, but it isn’t your HQ script.');
        return j;
      }, function (e) { throw e instanceof HqError ? e : new HqError('That address answered, but it isn’t your HQ script.'); });
  }

  function renderSignin(problem) {
    document.title = 'Sign in · Showsum HQ';
    $('#app').innerHTML =
      '<main class="gate"><div class="gate-card">' + brand() +
      '<div><h1 class="h2">Sign in</h1><p class="lede" style="margin-top:6px">Use your Google account. HQ checks it with your own script before showing anything.</p></div>' +
      (problem ? '<p class="banner" style="margin:0" role="alert">' + esc(problem) + '</p>' : '') +
      '<div class="gsi-slot" id="gsi"><span class="loading"><span class="spinner"></span>Loading Google sign-in</span></div>' +
      '<p class="error" id="s-err" role="alert" hidden></p>' +
      '<p class="note">Wrong device or script? <a href="#" id="s-change">Change the connection</a></p>' +
      '</div></main><div class="toasts" id="toasts"></div>';
    $('#s-change').addEventListener('click', function (ev) { ev.preventDefault(); renderConnect(); });
    loadGsi().then(function () {
      var slot = $('#gsi');
      if (!slot) return;
      slot.innerHTML = '';
      google.accounts.id.renderButton(slot, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', logo_alignment: 'left', width: 280 });
      if (!problem) { try { google.accounts.id.prompt(); } catch (e) { /* the button is there */ } }
    }, function (e) {
      var slot = $('#gsi'); if (slot) slot.innerHTML = '';
      var err = $('#s-err'); if (err) { err.textContent = e.message; err.hidden = false; }
    });
  }

  // ------------------------------------------------------------------------------------------------ the shell
  function routeFromHash() {
    var m = /^#\/([a-z]+)/.exec(location.hash || '');
    var r = m && m[1];
    return NAV.some(function (n) { return n[0] === r; }) ? r : 'overview';
  }

  function onHash() {
    if (!S.token && !S.user) return;
    if (S.editing && !confirmLeave()) { history.replaceState(null, '', '#/launchpad'); return; }
    S.editing = false; S.draft = null;
    S.route = routeFromHash();
    renderShell(); renderRoute();
    window.scrollTo(0, 0);
  }

  function confirmLeave() {
    return window.confirm('Leave without saving your Launchpad changes?');
  }

  function renderShell() {
    var avatar = S.user && S.user.picture
      ? '<span class="avatar" title="' + esc(S.user.email || '') + '"><img src="' + esc(S.user.picture) + '" alt="" referrerpolicy="no-referrer"></span>'
      : '<span class="avatar" aria-hidden="true">' + esc(firstInitial()) + '</span>';
    var navA = function (n, cls) {
      var cur = S.route === n[0] ? ' aria-current="page"' : '';
      return cls === 'rail'
        ? '<a class="nav-a" href="#/' + n[0] + '" title="' + n[1] + '" aria-label="' + n[1] + '"' + cur + '>' + n[2] + '</a>'
        : '<a href="#/' + n[0] + '"' + cur + '><span class="ic">' + n[2] + '</span>' + n[1] + '</a>';
    };
    if (!$('#shell')) {
      $('#app').innerHTML =
        '<div class="shell" id="shell"><nav class="rail" id="rail" aria-label="Main"></nav>' +
        '<main class="main" id="main" tabindex="-1"></main></div>' +
        '<nav class="tabbar" id="tabbar" aria-label="Main"></nav><div class="toasts" id="toasts"></div>';
    }
    $('#rail').innerHTML = '<div class="mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
      NAV.map(function (n) { return navA(n, 'rail'); }).join('') + avatar;
    $('#tabbar').innerHTML = NAV.map(function (n) { return navA(n, 'tab'); }).join('');
  }

  function setBanner(kind) { S.banner = kind || ''; var b = $('#banner'); if (b) b.outerHTML = bannerHtml(); else if (kind) renderRoute(); bindBanner(); }

  function bannerHtml() {
    var k = S.banner;
    var behind = S.build != null && S.build < EXPECT_BUILD;
    var ahead = S.build != null && S.build > EXPECT_BUILD;
    if (!k && behind) k = 'behind';
    if (!k && ahead) k = 'ahead';
    if (!k && !PIN && S.pin && S.route !== 'settings') k = 'pin';
    if (!k) return '<div id="banner" hidden></div>';
    var msg = '', btn = '';
    if (k === 'signin') { msg = 'Your sign-in has run out. Sign in again to carry on.'; btn = '<div id="banner-gsi"></div>'; }
    else if (k === 'pin') { msg = 'HQ isn’t locked to your script yet. Settings shows the two lines to put in config.js.'; btn = '<a class="btn small yellow" href="#/settings">Show me</a>'; }
    else if (k === 'offline') msg = 'You’re offline, or your HQ script didn’t answer. Showing what HQ saved last time.';
    else if (k === 'behind') msg = 'Your HQ script is release ' + S.build + '. This app expects release ' + EXPECT_BUILD + '. Paste the new Code.gs and deploy a new version.';
    else if (k === 'ahead') { msg = 'Your HQ script is newer than this app. Reload to update HQ.'; btn = '<button class="btn small yellow" id="banner-reload">Reload</button>'; }
    else if (k.indexOf('error:') === 0) { msg = k.slice(6); btn = '<button class="btn small" id="banner-retry">Try again</button>'; }
    return '<div class="banner" id="banner" role="status"><span class="grow">' + esc(msg) + '</span>' + btn + '</div>';
  }

  function bindBanner() {
    var g = $('#banner-gsi');
    if (g) loadGsi().then(function () { google.accounts.id.renderButton(g, { theme: 'filled_black', size: 'medium', shape: 'pill', text: 'signin', width: 200 }); });
    var r = $('#banner-reload'); if (r) r.onclick = function () { location.reload(); };
    var t = $('#banner-retry'); if (t) t.onclick = function () { setBanner(''); startApp(); };
  }

  function renderRoute() {
    var main = $('#main');
    if (!main) return;
    var html = '';
    if (S.route === 'overview') html = pageOverview();
    else if (S.route === 'sectors') html = pageSoon('sectors');
    else if (S.route === 'inbox') html = pageSoon('inbox');
    else if (S.route === 'customers') html = pageSoon('customers');
    else if (S.route === 'launchpad') html = pageLaunchpad();
    else if (S.route === 'settings') html = pageSettings();
    main.innerHTML = bannerHtml() + html;
    document.title = (NAV.filter(function (n) { return n[0] === S.route; })[0] || NAV[0])[1] + ' · Showsum HQ';
    bindBanner();
    if (S.route === 'launchpad') bindLaunchpad();
    if (S.route === 'settings') bindSettings();
  }

  function head(eyebrow, title, lede, right) {
    return '<header class="page-head"><div><span class="eyebrow live">' + eyebrow + '</span>' +
      '<h1 class="h1">' + esc(title) + '</h1>' + (lede ? '<p class="lede">' + lede + '</p>' : '') + '</div>' +
      (right ? '<div class="actions">' + right + '</div>' : '') + '</header>';
  }

  // ------------------------------------------------------------------------------------------------ Overview (release 1)
  var STEPS = [
    ['Shell', 'Sign-in, Launchpad, Settings'],
    ['Overview', 'Your live pipeline, read-only'],
    ['Batches', 'Start batches from your prospects'],
    ['Inbox', 'Confirm replies and bounces'],
    ['Autopilot', 'Sends by show dates'],
    ['Exhibitors', 'Shows, exhibitors, checks, Go'],
    ['Sectors', 'Lines, show lists, your turn'],
    ['Phone', 'Polish for your phone']
  ];
  var DONE_STEPS = 1;

  function pageOverview() {
    var stops = STEPS.map(function (s, i) {
      var cls = i < DONE_STEPS ? 'done' : i === DONE_STEPS ? 'now' : 'todo';
      return '<div class="stop ' + cls + '" title="' + esc(s[1]) + '"><span class="st"></span><small>STEP ' + (i + 1) + '</small><span class="t">' + esc(s[0]) + '</span></div>';
    }).join('');
    return head('<span class="pulse' + (S.offline ? ' off' : '') + '"></span>' + esc(nowLine()), greeting(),
        'HQ is connected and locked to your Google account. Your pipeline carries on exactly as before.') +
      '<section class="panel" aria-labelledby="ov-line"><div class="panel-head"><div><span class="eyebrow">Build</span><h2 class="h2" id="ov-line">The HQ line</h2>' +
      '<span class="sub small">Each stop is one release. Green is done; yellow is next.</span></div></div>' +
      '<div class="line-track" role="list">' + stops + '</div></section>' +
      '<div class="grid-2">' +
      '<section class="panel"><span class="tag mint">WORKING NOW</span><h3 class="h3">What HQ does today</h3><div class="soon"><ul>' +
      '<li>Opens only for your Google account, checked by your own HQ script on every request.</li>' +
      '<li><a href="#/launchpad">Launchpad</a>: every sheet, app, dashboard and chat you use, one tap away. Edit it to add your own.</li>' +
      '<li><a href="#/settings">Settings</a>: what’s connected, what’s still to fill in, and a link to open HQ on your phone.</li></ul></div></section>' +
      '<section class="panel"><span class="tag">NEXT STOP · STEP 2</span><h3 class="h3">Your live pipeline</h3><div class="soon"><ul>' +
      '<li>Today’s sending against your daily limit, bounces and opt-outs.</li>' +
      '<li>Every show already in the pipeline, with its prospects by stage and what each one is due next.</li>' +
      '<li>Arrivals: replies, visits and sales. Customers once the first real sale lands.</li>' +
      '<li>Read-only. Rows already in the pipeline stay paused until you start them as batches in step 3.</li></ul></div></section>' +
      '</div>';
  }

  function pageSoon(which) {
    var p = {
      sectors: ['Sectors', 6, 'Shows, exhibitors and sector lines', [
        'Everything the Exhibitor Leads app does: shows, exhibitors, checks, Why this result?, Find on Companies House, rechecks and CSV.',
        'Go for new shows, with a fast lane for confirmed limited companies on Google Workspace or Microsoft 365.',
        'Then a line per sector, with your turn steps and show lists (step 7).']],
      inbox: ['Inbox', 4, 'Every reply and bounce', [
        'Each reply with its first line, and a guess: real or automatic.',
        'Confirm with one tap. A real reply moves the prospect to Engaged.',
        'Bounces with the reason, and the address marked so it’s never emailed again.']],
      customers: ['Customers', 2, 'Who’s paying, and on which plan', [
        'Event Pass, Monthly, Annual and Own-it, with money taken and monthly recurring income.',
        'Passes ending and renewals coming up.',
        'Stays empty until the first real sale; test rows are left out.']]
    }[which];
    return head('ARRIVES IN STEP ' + p[1], p[0], esc(p[2]) + '.') +
      '<section class="panel"><span class="tag">STEP ' + p[1] + '</span><div class="soon"><ul>' +
      p[3].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></section>';
  }

  // ------------------------------------------------------------------------------------------------ Launchpad
  function pageLaunchpad() {
    var d = S.editing ? S.draft : S.links;
    var right = S.editing
      ? '<button class="btn" id="lp-cancel">Cancel</button><button class="btn yellow" id="lp-save">Save</button>'
      : '<button class="btn" id="lp-edit"' + (S.links ? '' : ' disabled') + '>' + I.edit + 'Edit</button>';
    var html = head('LAUNCHPAD', 'Launchpad', 'Everything you open, in one place.', right);
    if (!d) return html + '<section class="panel"><span class="loading"><span class="spinner"></span>Loading your links</span></section>';
    if (d.starter && !S.editing) html += '<p class="banner" style="margin:0"><span class="grow">These are starter links. Tap Edit to add your Showsum app, your Looker report and the chats you use for pages and show lists.</span></p>';
    html += d.groups.map(function (g, gi) {
      var colour = TILE_COLOURS[gi % TILE_COLOURS.length];
      var tools = S.editing
        ? '<div class="tools"><button class="icon-btn" data-act="g-up" data-g="' + gi + '" aria-label="Move ' + esc(g.name) + ' up"' + (gi === 0 ? ' disabled' : '') + '>' + I.up + '</button>' +
          '<button class="icon-btn" data-act="g-down" data-g="' + gi + '" aria-label="Move ' + esc(g.name) + ' down"' + (gi === d.groups.length - 1 ? ' disabled' : '') + '>' + I.down + '</button>' +
          '<button class="icon-btn" data-act="g-edit" data-g="' + gi + '" aria-label="Rename ' + esc(g.name) + '">' + I.edit + '</button>' +
          '<button class="icon-btn" data-act="g-del" data-g="' + gi + '" aria-label="Remove ' + esc(g.name) + '">' + I.bin + '</button></div>'
        : '';
      var tiles = g.links.map(function (l, li) {
        var letter = esc((l.title || '?').trim().charAt(0).toUpperCase());
        var sub = l.note ? esc(l.note) : '<span class="host">' + esc(hostOf(l.url)) + '</span>';
        var ico = '<span class="mono-ico" style="background:' + colour + '" aria-hidden="true">' + letter + '</span>';
        var tx = '<span class="tx"><b>' + esc(l.title) + '</b><span>' + sub + '</span></span>';
        if (!S.editing) {
          var safe = LINK_RE.test(l.url) ? l.url : '#';
          return '<a class="tile" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer">' + ico + tx + '<span class="out">' + I.out + '</span></a>';
        }
        return '<div class="tile editing">' + ico + tx + '<span class="edit-tools">' +
          '<button class="icon-btn" data-act="l-up" data-g="' + gi + '" data-l="' + li + '" aria-label="Move ' + esc(l.title) + ' earlier"' + (li === 0 ? ' disabled' : '') + '>' + I.up + '</button>' +
          '<button class="icon-btn" data-act="l-down" data-g="' + gi + '" data-l="' + li + '" aria-label="Move ' + esc(l.title) + ' later"' + (li === g.links.length - 1 ? ' disabled' : '') + '>' + I.down + '</button>' +
          '<button class="icon-btn" data-act="l-edit" data-g="' + gi + '" data-l="' + li + '" aria-label="Edit ' + esc(l.title) + '">' + I.edit + '</button>' +
          '<button class="icon-btn" data-act="l-del" data-g="' + gi + '" data-l="' + li + '" aria-label="Remove ' + esc(l.title) + '">' + I.bin + '</button></span></div>';
      }).join('');
      if (S.editing) tiles += '<button class="add-tile" data-act="l-add" data-g="' + gi + '">' + I.plus + 'Add a link</button>';
      if (!g.links.length && !S.editing) tiles = '<p class="note" style="margin:0">Nothing here yet.</p>';
      return '<section class="lp-group" aria-label="' + esc(g.name) + '"><div class="lp-group-head"><span class="eyebrow">' + esc(g.name) + '</span>' + tools + '</div>' +
        '<div class="lp-grid">' + tiles + '</div></section>';
    }).join('');
    if (S.editing) html += '<div><button class="btn" data-act="g-add">' + I.plus + 'Add a group</button></div>';
    return html;
  }

  function bindLaunchpad() {
    var main = $('#main');
    var edit = $('#lp-edit');
    if (edit) edit.onclick = function () { S.editing = true; S.draft = JSON.parse(JSON.stringify(S.links)); delete S.draft.starter; renderRoute(); };
    var cancel = $('#lp-cancel');
    if (cancel) cancel.onclick = function () { S.editing = false; S.draft = null; renderRoute(); };
    var save = $('#lp-save');
    if (save) save.onclick = function () {
      save.disabled = true; save.innerHTML = '<span class="spinner"></span>Saving';
      call('saveLinks', { links: S.draft }).then(function (j) {
        S.links = j.links; store(LS.links, j.links);
        S.editing = false; S.draft = null; renderRoute(); toast('Launchpad saved');
      }, function (e) {
        save.disabled = false; save.textContent = 'Save';
        toast(e.kind === 'signin' ? 'Sign in again, then save.' : e.message, true);
      });
    };
    main.onclick = function (ev) {
      var b = ev.target.closest('[data-act]');
      if (!b || !S.editing) return;
      var d = S.draft, gi = Number(b.dataset.g), li = Number(b.dataset.l), act = b.dataset.act;
      var g = d.groups[gi];
      var swap = function (arr, i, j) { var t = arr[i]; arr[i] = arr[j]; arr[j] = t; };
      if (act === 'g-up' && gi > 0) swap(d.groups, gi, gi - 1);
      else if (act === 'g-down' && gi < d.groups.length - 1) swap(d.groups, gi, gi + 1);
      else if (act === 'l-up' && li > 0) swap(g.links, li, li - 1);
      else if (act === 'l-down' && li < g.links.length - 1) swap(g.links, li, li + 1);
      else if (act === 'l-del') g.links.splice(li, 1);
      else if (act === 'g-del') {
        if (g.links.length && !window.confirm('Remove “' + g.name + '” and its ' + g.links.length + ' link' + (g.links.length === 1 ? '' : 's') + '?')) return;
        d.groups.splice(gi, 1);
      }
      else if (act === 'g-edit') return groupDialog(g);
      else if (act === 'g-add') return groupDialog(null);
      else if (act === 'l-edit') return linkDialog(gi, li);
      else if (act === 'l-add') return linkDialog(gi, -1);
      else return;
      renderRoute();
    };
  }

  function groupDialog(g) {
    dialog('<h2 class="h3">' + (g ? 'Rename the group' : 'Add a group') + '</h2>' +
      '<div class="field"><label for="d-name">Name</label><input class="input" id="d-name" maxlength="40" required value="' + esc(g ? g.name : '') + '"></div>',
      function (f) {
        var name = f.querySelector('#d-name').value.trim();
        if (!name) return 'Give it a name.';
        if (g) g.name = name;
        else S.draft.groups.push({ id: uid(), name: name, links: [] });
        renderRoute();
        return '';
      });
  }

  function linkDialog(gi, li) {
    var l = li >= 0 ? S.draft.groups[gi].links[li] : { title: '', url: '', note: '' };
    var opts = S.draft.groups.map(function (g, i) { return '<option value="' + i + '"' + (i === gi ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('');
    dialog('<h2 class="h3">' + (li >= 0 ? 'Edit the link' : 'Add a link') + '</h2>' +
      '<div class="field"><label for="d-title">Name</label><input class="input" id="d-title" maxlength="60" required value="' + esc(l.title) + '"></div>' +
      '<div class="field"><label for="d-url">Address</label><input class="input mono" id="d-url" type="url" inputmode="url" spellcheck="false" maxlength="600" required placeholder="https://" value="' + esc(l.url) + '"></div>' +
      '<div class="field"><label for="d-note">Note <span class="muted">(optional)</span></label><input class="input" id="d-note" maxlength="90" value="' + esc(l.note || '') + '"></div>' +
      '<div class="field"><label for="d-group">Group</label><select class="input" id="d-group">' + opts + '</select></div>',
      function (f) {
        var title = f.querySelector('#d-title').value.trim();
        var url = f.querySelector('#d-url').value.trim();
        var note = f.querySelector('#d-note').value.trim();
        var to = Number(f.querySelector('#d-group').value);
        if (!title) return 'Give it a name.';
        if (!LINK_RE.test(url)) return 'The address needs to start https://';
        var item = { id: l.id || uid(), title: title, url: url, note: note };
        if (li >= 0) S.draft.groups[gi].links.splice(li, 1);
        if (li >= 0 && to === gi) S.draft.groups[gi].links.splice(li, 0, item);
        else S.draft.groups[to].links.push(item);
        renderRoute();
        return '';
      });
  }

  function dialog(inner, onOk) {
    var d = document.createElement('dialog');
    d.innerHTML = '<form method="dialog" novalidate>' + inner + '<p class="error" role="alert" hidden></p>' +
      '<div class="foot"><button class="btn" value="cancel" type="button" data-x>Cancel</button><button class="btn yellow" value="ok" type="submit">Done</button></div></form>';
    document.body.appendChild(d);
    var f = d.querySelector('form');
    d.querySelector('[data-x]').onclick = function () { d.close(); };
    d.addEventListener('close', function () { d.remove(); });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = onOk(f);
      if (err) { var p = f.querySelector('.error'); p.textContent = err; p.hidden = false; return; }
      d.close();
    });
    d.showModal();
    var first = d.querySelector('input'); if (first) first.focus();
  }

  // ------------------------------------------------------------------------------------------------ Settings
  function row(state, title, detail, right) {
    var dot = state === 'ok' ? '<span class="ok-dot" aria-label="OK"></span>' : state === 'wait' ? '<span class="wait-dot" aria-label="Checking"></span>' :
      '<span class="no-dot' + (state === 'bad' ? ' bad' : '') + '" aria-label="' + (state === 'bad' ? 'Problem' : 'Not yet') + '"></span>';
    return '<div class="row">' + dot + '<span class="what"><b>' + title + '</b>' + (detail ? '<span>' + detail + '</span>' : '') + '</span>' + (right || '<span></span>') + '</div>';
  }

  function pageSettings() {
    var u = S.user || {};
    var html = head('SETTINGS', 'Settings', 'What’s connected, and what’s still to fill in.');

    html += '<div class="grid-2">';
    html += '<section class="panel"><div class="panel-head"><div><span class="eyebrow">You</span><h2 class="h3">Signed in</h2></div></div>' +
      '<div style="display:flex;align-items:center;gap:14px">' +
      (u.picture ? '<span class="avatar" style="width:48px;height:48px"><img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer"></span>' : '<span class="avatar" style="width:48px;height:48px">' + esc(firstInitial()) + '</span>') +
      '<span style="display:flex;flex-direction:column;min-width:0"><b>' + esc(u.name || 'You') + '</b><span class="sub small" style="overflow-wrap:anywhere">' + esc(u.email || (S.claims && S.claims.email) || '') + '</span></span></div>' +
      '<p class="note" style="margin:0">Your sign-in renews by itself while HQ is open. Every request is checked by your HQ script.</p>' +
      '<div class="actions"><button class="btn" id="st-signout">' + I.signout + 'Sign out</button></div></section>';

    var behind = S.build != null && S.build < EXPECT_BUILD;
    html += '<section class="panel"><div class="panel-head"><div><span class="eyebrow">HQ script</span><h2 class="h3">Release ' + esc(S.build == null ? '…' : S.build) + '</h2></div></div>' +
      '<div class="rows">' +
      row(S.build == null ? 'wait' : behind ? 'bad' : 'ok', S.build == null ? 'Checking' : behind ? 'Needs updating' : 'Up to date', 'This app expects release ' + EXPECT_BUILD + '.') +
      row('ok', 'Address', esc(maskUrl(S.config && S.config.url))) +
      (PIN ? row('ok', 'Locked to this script', 'config.js holds its fingerprint, so links to any other script are refused.')
        : row('bad', 'Not locked to this script yet', 'In GitHub, open config.js, press the pencil, fill in these two lines and commit:') +
          '<pre class="pin mono">clientId: \'' + esc((S.config && S.config.clientId) || '') + '\',\nscriptPin: \'' + esc(S.pin || '…') + '\'</pre>') + '</div>' +
      '<div class="actions"><button class="btn small" id="st-change">Change the connection</button><button class="btn small danger" id="st-forget">Forget this device</button></div></section>';
    html += '</div>';

    // Data and back ends
    var st = S.status;
    var dataRows;
    if (!st && !S.statusErr) dataRows = '<span class="loading"><span class="spinner"></span>Checking your sheets and web apps</span>';
    else if (!st) dataRows = '<p class="error" style="margin:0">' + esc(S.statusErr) + '</p>';
    else {
      dataRows = '<div class="rows">' +
        st.sheets.map(function (s) {
          return row(s.ok ? 'ok' : (s.why && s.why.indexOf('Not set') === 0 ? 'no' : 'bad'), esc(s.label),
            s.ok ? esc('“' + s.name + '” · ' + s.tabs.length + ' tabs') : esc(s.why),
            s.ok ? '<a class="btn small" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">Open' + I.out + '</a>' : '');
        }).join('') +
        st.backends.map(function (b) {
          var detail = b.ok ? esc((b.app || 'Answering') + (b.build != null ? ' · release ' + b.build : '')) : esc(b.why);
          if (b.key === 'el' && b.ok && b.build < 19) detail += esc(' · step 6 will need release 19');
          return row(b.ok ? 'ok' : (b.why && b.why.indexOf('Not set') === 0 ? 'no' : 'bad'), esc(b.label), detail);
        }).join('') +
        row(st.telegram ? 'ok' : 'no', 'Telegram', st.telegram ? 'Ready for “your turn” pings' : 'Not set yet (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)',
          st.telegram ? '<button class="btn small" id="st-tg">' + I.send + 'Send a test</button>' : '') +
        '</div>';
    }
    html += '<section class="panel"><div class="panel-head"><div><span class="eyebrow">Connected</span><h2 class="h3">Your data and web apps</h2>' +
      '<span class="sub small">HQ opens these with your HQ script. Values never leave the script.</span></div>' +
      '<button class="btn small" id="st-recheck">' + I.refresh + 'Check again</button></div>' + dataRows + '</section>';

    // Script Properties checklist
    var props = (st && st.props) || S.props;
    html += '<section class="panel"><div class="panel-head"><div><span class="eyebrow">Script Properties</span><h2 class="h3">Settings in your HQ script</h2>' +
      '<span class="sub small">Apps Script → Project Settings → Script Properties. HQ only ever sees whether each one is filled in.</span></div></div>' +
      (props ? '<div class="rows">' + props.map(function (p) {
        return row(p.set ? 'ok' : 'no', '<span class="mono">' + esc(p.name) + '</span>', esc(p.what) + (p.set ? '' : ' · needed from step ' + p.step));
      }).join('') + '</div>' : '<span class="loading"><span class="spinner"></span>Loading</span>') + '</section>';

    // Phone and app
    html += '<div class="grid-2">';
    html += '<section class="panel"><div class="panel-head"><div><span class="eyebrow">Phone</span><h2 class="h3">Open HQ on your phone</h2></div></div>' +
      '<p class="sub" style="margin:0">Send yourself this link and open it on your phone. It fills in the connection, then you sign in with Google as usual.</p>' +
      (PIN ? '<div class="actions"><button class="btn small" id="st-copy">' + I.copy + 'Copy the link</button>' +
        (navigator.share ? '<button class="btn small" id="st-share">' + I.share + 'Share</button>' : '') + '</div>' +
        '<p class="note" style="margin:0">The link holds your script’s address, which isn’t a password: HQ still only opens for your Google account, and only connects to the script in config.js.</p>'
        : '<p class="note" style="margin:0">The link works once HQ is locked to your script (see HQ script above). Until then, enter the address on your phone.</p>') + '</section>';
    html += '<section class="panel"><div class="panel-head"><div><span class="eyebrow">This app</span><h2 class="h3">Showsum HQ ' + APP_VERSION + '</h2></div></div>' +
      '<dl class="kv"><dt>App release</dt><dd>' + APP_VERSION + '</dd><dt>Script release</dt><dd>' + esc(S.build == null ? '…' : S.build) + '</dd>' +
      '<dt>Installed</dt><dd>' + (matchMedia('(display-mode: standalone)').matches ? 'Yes' : 'No, running in the browser') + '</dd></dl>' +
      '<div class="actions">' + (S.installEvt ? '<button class="btn small yellow" id="st-install">' + I.download + 'Install HQ</button>' : '') +
      '<button class="btn small" id="st-reload">' + I.refresh + 'Reload</button></div></section>';
    html += '</div>';
    return html;
  }

  function bindSettings() {
    var on = function (id, fn) { var el = $(id); if (el) el.onclick = fn; };
    on('#st-signout', signOut);
    on('#st-change', function () { renderConnect(); });
    on('#st-forget', function () {
      if (!window.confirm('Forget this device? HQ will ask for the connection and sign-in again.')) return;
      try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
      forgetConnection();
      renderConnect();
    });
    on('#st-recheck', function () { S.status = null; S.statusErr = ''; renderRoute(); fetchStatus(); });
    on('#st-tg', function (ev) {
      var b = ev.currentTarget; b.disabled = true;
      call('testTelegram').then(function (j) { b.disabled = false; toast(j.sent ? 'Test sent to Telegram' : (j.why || 'Not sent'), !j.sent); },
        function (e) { b.disabled = false; toast(e.message, true); });
    });
    on('#st-copy', function () {
      var link = phoneLink();
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(
        function () { toast('Link copied'); },
        function () { window.prompt('Copy this link', link); });
    });
    on('#st-share', function () { navigator.share({ title: 'Showsum HQ', url: phoneLink() }).catch(function () { /* cancelled */ }); });
    on('#st-install', function () {
      var e = S.installEvt; if (!e) return;
      e.prompt();
      e.userChoice.then(function () { S.installEvt = null; renderRoute(); });
    });
    on('#st-reload', function () { location.reload(); });
    if (!S.status && !S.statusErr && !S.busy.status) fetchStatus();
  }

  function fetchStatus() {
    S.busy.status = true;
    call('status', {}, { timeout: 90000 }).then(function (j) {
      S.busy.status = false;
      S.status = j; S.statusErr = '';
      if (S.route === 'settings') renderRoute();
    }, function (e) {
      S.busy.status = false;
      S.statusErr = e.kind === 'signin' ? 'Sign in again to check.' : e.message;
      if (S.route === 'settings') renderRoute();
    });
  }

  function phoneLink() {
    var code = b64urlEncode(JSON.stringify(FIXED_CLIENT ? { u: S.config.url } : { u: S.config.url, c: S.config.clientId }));
    return location.origin + location.pathname + '#connect=' + code;
  }

  // For the local test run only; never on the live site.
  if (location.hostname === 'localhost') window.__hq = { S: S, EXPECT_BUILD: EXPECT_BUILD, APP_VERSION: APP_VERSION };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
