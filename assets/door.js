/* NOEASY · door.js — visit counter without cookies + newsletter form helper.
   Built and published by the Mindgate bot (template: site/door.js in the bot repo).
   Edits made to assets/door.js on the site are overwritten on the next bot deploy.
   Nothing is stored in the browser: no cookies, no IDs. The server sees one page view,
   the seconds the tab was on screen and a few actions (entered The Halls, opened a painting,
   followed a link to another site). ?nocount=1 turns counting off in this browser, ?nocount=0 back on. */
(function () {
  'use strict';
  var API = 'https://web-production-64d3.up.railway.app', MAIL = true, VER = '1e7741e2';
  var w = window, d = document, nav = navigator, ls = null;
  try { ls = w.localStorage; } catch (e) {}
  try {
    var m = /[?&#]nocount=([01])/.exec(location.search + location.hash);
    if (m && ls) { if (m[1] === '1') ls.setItem('noeasy-nocount', '1'); else ls.removeItem('noeasy-nocount'); }
  } catch (e) {}
  var off = !/^https?:$/.test(location.protocol) || !!nav.webdriver ||
    nav.globalPrivacyControl === true || nav.doNotTrack === '1' || w.doNotTrack === '1';
  try { if (ls && ls.getItem('noeasy-nocount') === '1') off = true; } catch (e) {}

  function rid() {
    var a = new Uint8Array(9), s = '', i;
    try { (w.crypto || w.msCrypto).getRandomValues(a); } catch (e) { for (i = 0; i < 9; i++) a[i] = Math.random() * 256 | 0; }
    for (i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return s;
  }
  var pid = rid();

  function send(o) {
    if (off) return;
    o.id = pid;
    var body = JSON.stringify(o);
    try { if (nav.sendBeacon && nav.sendBeacon(API + '/api/hello', new Blob([body], { type: 'text/plain' }))) return; } catch (e) {}
    try {
      fetch(API + '/api/hello', { method: 'POST', body: body, keepalive: true, mode: 'cors', credentials: 'omit',
        headers: { 'Content-Type': 'text/plain' } })['catch'](function () {});
    } catch (e) {}
  }

  function device() {
    var touch = (nav.maxTouchPoints || 0) > 0 || 'ontouchstart' in w;
    if (!touch) return 'd';
    return Math.min(screen.width || 0, screen.height || 0) >= 600 ? 't' : 'm';
  }
  function pageview() {
    var ref = '';
    try { if (d.referrer) { var u = new URL(d.referrer); if (u.host !== location.host) ref = u.host; } } catch (e) {}
    send({ k: 'pv', p: location.pathname, r: ref, dv: device() });
  }

  /* seconds on screen: only while the tab is visible and someone touched it in the last 5 minutes */
  var IDLE = 300000, shown = 0, hall = 0, entered = false, last = Date.now(), lastAct = last, sent = -1, ticks = 0;
  function tick() {
    var t = Date.now(), dt = Math.min(t - last, 10000);
    last = t;
    if (d.visibilityState !== 'hidden' && t - lastAct < IDLE) { shown += dt; if (entered) hall += dt; }
  }
  function flush() {
    tick();
    var s = Math.round(shown / 1000);
    if (s === sent) return;
    sent = s;
    send({ k: 't', d: s, e: entered ? Math.round(hall / 1000) : 0 });
  }
  function act() { lastAct = Date.now(); }
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove'].forEach(function (e) {
    w.addEventListener(e, act, { passive: true, capture: true });
  });
  setInterval(function () {               /* report at 10 s, then every 30 s while the tab is on screen */
    tick(); ticks++;
    if ((ticks === 2 || ticks % 6 === 0) && d.visibilityState !== 'hidden') flush();
  }, 5000);
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'hidden') flush(); else { last = Date.now(); act(); }
  });
  w.addEventListener('pagehide', flush);
  w.addEventListener('pageshow', function (e) {          /* back from the browser cache = a new view */
    if (!e.persisted) return;
    pid = rid(); shown = 0; hall = 0; entered = false; sent = -1; last = Date.now(); act(); pageview();
  });

  /* links to other sites and buttons marked data-track="…" */
  function clicks(e) {
    var t = e.target, el;
    if (!t || !t.closest) return;
    if ((el = t.closest('[data-track]'))) send({ k: 'click', t: el.getAttribute('data-track') });
    if ((el = t.closest('a[href]'))) {
      try {
        var u = new URL(el.href, location.href);
        if (/^https?:$/.test(u.protocol) && u.host !== location.host) send({ k: 'out', t: u.host });
      } catch (err) {}
    }
  }
  d.addEventListener('click', clicks, true);
  d.addEventListener('auxclick', function (e) { if (e.button === 1) clicks(e); }, true);

  w.noeasy = {
    api: API, mail: MAIL, version: VER, counting: !off,
    track: function (k, data) {
      var o = { k: k }, x;
      if (data) for (x in data) if (Object.prototype.hasOwnProperty.call(data, x)) o[x] = data[x];
      if (k === 'enter') { tick(); entered = true; act(); }
      send(o);
    },
    subscribe: function (email, extra) {
      var o = { email: email, src: 'home' }, x;
      if (extra) for (x in extra) if (Object.prototype.hasOwnProperty.call(extra, x)) o[x] = extra[x];
      return fetch(API + '/api/newsletter', { method: 'POST', mode: 'cors', credentials: 'omit',
        headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(o) })
        .then(function (r) {
          return r.json()['catch'](function () { return {}; }).then(function (j) {
            if (!r.ok || !j.ok) { var err = new Error(j.error || 'http ' + r.status); err.code = j.error || 'http'; throw err; }
            return j;
          });
        });
    }
  };
  pageview();
  try { d.dispatchEvent(new Event('noeasy:ready')); } catch (e) {}
})();
