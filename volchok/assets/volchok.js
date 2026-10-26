/* VOLCHOK — прототип: меню, ларец, слоты, размеры. */
(function () {
  'use strict';

  var KEY = 'volchok-proto-larets';

  function readCount() {
    try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { return 0; }
  }
  function writeCount(n) {
    try { localStorage.setItem(KEY, String(n)); } catch (e) { /* приватный режим */ }
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* ---- ларец ---- */
  var count = readCount();
  function paintCount() {
    document.querySelectorAll('[data-larets]').forEach(function (el) {
      el.textContent = 'ЛАРЕЦ · ' + count;
      el.setAttribute('aria-label', 'Ларец, ' + count + ' ' + plural(count, 'предмет', 'предмета', 'предметов'));
    });
  }
  paintCount();

  var toastEl, toastTimer;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2400);
  }

  document.querySelectorAll('[data-add]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var n = parseInt(btn.getAttribute('data-add'), 10) || 1;
      count += n;
      writeCount(count);
      paintCount();
      toast(btn.getAttribute('data-toast') || 'Положено в ларец');
    });
  });

  document.querySelectorAll('[data-larets]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (count === 0) { toast('Ларец пуст'); return; }
      toast('В ларце ' + count + ' ' + plural(count, 'предмет', 'предмета', 'предметов') + ' · оформление появится позже');
    });
  });

  /* ---- меню ---- */
  var menu = document.getElementById('menu');
  var opener = document.querySelector('[data-menu-open]');
  function setMenu(open) {
    if (!menu) return;
    menu.hidden = !open;
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (opener) opener.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var first = menu.querySelector('a, button');
      if (first) first.focus();
    } else if (opener) {
      opener.focus();
    }
  }
  if (opener) opener.addEventListener('click', function () { setMenu(true); });
  document.querySelectorAll('[data-menu-close]').forEach(function (b) {
    b.addEventListener('click', function () { setMenu(false); });
  });
  if (menu) {
    menu.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }

  /* ---- слоты в сокровищнице ---- */
  var tabs = document.querySelectorAll('[data-slot-tab]');
  if (tabs.length) {
    var cards = document.querySelectorAll('[data-slot]');
    var counter = document.querySelector('[data-count]');
    function applySlot(slot) {
      var shown = 0;
      tabs.forEach(function (t) {
        t.setAttribute('aria-pressed', t.getAttribute('data-slot-tab') === slot ? 'true' : 'false');
      });
      cards.forEach(function (c) {
        var on = slot === 'all' || c.getAttribute('data-slot') === slot;
        c.hidden = !on;
        if (on) shown++;
      });
      if (counter) counter.textContent = shown + ' ' + plural(shown, 'ПРЕДМЕТ', 'ПРЕДМЕТА', 'ПРЕДМЕТОВ');
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        var slot = t.getAttribute('data-slot-tab');
        applySlot(slot);
        try { history.replaceState(null, '', slot === 'all' ? location.pathname : '?slot=' + slot); } catch (e) {}
      });
    });
    var wanted = new URLSearchParams(location.search).get('slot');
    var known = Array.prototype.some.call(tabs, function (t) { return t.getAttribute('data-slot-tab') === wanted; });
    applySlot(known ? wanted : 'all');
  }

  /* ---- размеры ---- */
  var sizes = document.querySelectorAll('.size');
  sizes.forEach(function (s) {
    s.addEventListener('click', function () {
      if (s.disabled) return;
      sizes.forEach(function (o) { if (!o.disabled) o.setAttribute('aria-pressed', o === s ? 'true' : 'false'); });
    });
  });
})();
