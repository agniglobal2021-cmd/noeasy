/* NOEASY · site.js — shared by every page: the film grain, the ring cursor and pull-to-refresh.

   GRAIN. One 256×256 noise tile is drawn once, when the page opens, and becomes the
   background of <div id="grain">. CSS then jumps the layer to a new offset ten times a
   second. Moving a layer is the graphics card's job, so the processor stays free —
   the old canvas redrew every pixel of the screen sixty times a second.
   data-alpha on #grain = how strong the grain is (0–255, default 22).
   Each page sets the layer's z-index itself (the gallery keeps it under the works).
   Reduced motion: the grain stays still.

   CURSOR. A thin ring follows the mouse and shrinks on click. Only on devices with a
   mouse (hover + fine pointer); phones and tablets never get it.

   PULL TO REFRESH (touch screens, every page but Home). The browser's own pull is switched off:
   it dragged the whole page, menu and all, down from the top. Pulling down at the top of the page
   (or of the window that scrolls, on About) slides a Win95 progress bar out from under the menu;
   the page itself does not move. Let go when the bar is full and the page reloads. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var fine = !!(w.matchMedia && w.matchMedia('(hover: hover) and (pointer: fine)').matches);
  var touch = 'ontouchstart' in w || (navigator.maxTouchPoints || 0) > 0;
  var home = /^\/(index\.html)?$/.test(location.pathname);

  var css =
    '#grain{position:fixed;inset:-256px;pointer-events:none;background-repeat:repeat;' +
      'background-size:256px 256px;will-change:transform;animation:noeasy-grain 1s steps(1,end) infinite}' +
    '@keyframes noeasy-grain{' +
      '0%{transform:translate3d(0,0,0)}10%{transform:translate3d(-61px,37px,0)}' +
      '20%{transform:translate3d(83px,-112px,0)}30%{transform:translate3d(-140px,-29px,0)}' +
      '40%{transform:translate3d(27px,151px,0)}50%{transform:translate3d(-97px,88px,0)}' +
      '60%{transform:translate3d(122px,64px,0)}70%{transform:translate3d(-18px,-133px,0)}' +
      '80%{transform:translate3d(146px,-71px,0)}90%{transform:translate3d(-119px,124px,0)}}' +
    '@media (prefers-reduced-motion:reduce){#grain{animation:none}}' +
    '#cursor{position:fixed;left:0;top:0;z-index:10000;pointer-events:none;width:28px;height:28px;' +
      'border-radius:50%;border:1px solid rgba(53,53,53,.35);mix-blend-mode:multiply;opacity:0;' +
      'transform:translate(-50%,-50%) scale(0);transition:transform .22s cubic-bezier(.34,1.56,.64,1),opacity .2s}' +
    '#cursor.active{opacity:1;transform:translate(-50%,-50%) scale(1)}' +
    '#cursor.pressed{transform:translate(-50%,-50%) scale(.6)}' +
    '@media (prefers-reduced-motion:reduce){#cursor{transition:opacity .2s}}' +
    /* pull to refresh */
    '#ptr{position:fixed;top:calc(var(--header-total-h,44px) - 34px);left:50%;z-index:498;width:176px;margin-left:-88px;height:26px;padding:4px;' +
      'background:#AFA191;border-top:2px solid #d4cdc4;border-left:2px solid #d4cdc4;border-right:2px solid #3d3830;border-bottom:2px solid #3d3830;' +
      'box-shadow:1px 1px 0 #2a2520;opacity:0;pointer-events:none;transition:transform .25s cubic-bezier(.16,1,.3,1),opacity .2s ease}' +
    '#ptr.on{opacity:1;transition:none}' +
    '#ptr .ptr-track{height:100%;padding:2px;overflow:hidden;background:#c8c2b8;border-top:1px solid #3d3830;border-left:1px solid #3d3830;border-right:1px solid #d4cdc4;border-bottom:1px solid #d4cdc4}' +
    '#ptr .ptr-fill{height:100%;width:0;background:repeating-linear-gradient(90deg,#5D5143 0 7px,transparent 7px 9px)}' +
    'html.ptr-on,html.ptr-on body{overscroll-behavior-y:none}';
  var style = d.createElement('style');
  style.textContent = css;
  d.head.appendChild(style);

  function tile(alphaMax) {
    var c = d.createElement('canvas');
    c.width = c.height = 256;
    var x = c.getContext && c.getContext('2d');
    if (!x) return '';
    var img = x.createImageData(256, 256), a = img.data;
    for (var i = 0; i < a.length; i += 4) {
      var v = Math.random() * 255 | 0;
      a[i] = a[i + 1] = a[i + 2] = v;
      a[i + 3] = Math.random() * alphaMax | 0;
    }
    x.putImageData(img, 0, 0);
    try { return c.toDataURL('image/png'); } catch (e) { return ''; }
  }

  function grain() {
    var g = d.getElementById('grain');
    if (!g) return;
    var alpha = parseInt(g.getAttribute('data-alpha'), 10) || 22;
    var url = tile(alpha);
    if (url) g.style.backgroundImage = 'url(' + url + ')';
  }

  function cursor() {
    if (!fine) return;
    if (d.getElementById('cursor')) return;
    var c = d.createElement('div');
    c.id = 'cursor';
    c.setAttribute('aria-hidden', 'true');
    d.body.appendChild(c);
    d.addEventListener('mousemove', function (e) {
      c.style.left = e.clientX + 'px';
      c.style.top = e.clientY + 'px';
      c.classList.add('active');
    }, { passive: true });
    d.addEventListener('mousedown', function () { c.classList.add('pressed'); });
    d.addEventListener('mouseup', function () { c.classList.remove('pressed'); });
    root.addEventListener('mouseleave', function () { c.classList.remove('active'); });
    w.addEventListener('blur', function () { c.classList.remove('active', 'pressed'); });
  }

  /* an open menu, filter panel, viewer or dialog owns the touch: no pulling */
  function overlayOpen() {
    return root.classList.contains('lb-is-open') ||
      !!d.querySelector('.nav-overlay.open, .filter-panel.open, #lightbox.open, .modal-overlay.open');
  }
  function docScroller() { return d.scrollingElement || root; }
  function scrollerOf(el) {
    for (var n = el; n && n !== d.body && n !== root; n = n.parentElement) {
      var oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return docScroller();
  }
  function haptic() { if (navigator.vibrate) navigator.vibrate(6); }

  function pullToRefresh() {
    if (home || !touch) return;
    root.classList.add('ptr-on');
    var bar = d.createElement('div');
    bar.id = 'ptr';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<div class="ptr-track"><div class="ptr-fill"></div></div>';
    d.body.appendChild(bar);
    var fill = bar.firstChild.firstChild;
    var NEED = 64, MAX = 78, y0 = null, pull = 0, active = false, decided = false, sc = null;
    d.addEventListener('touchstart', function (e) {
      y0 = null;
      if (e.touches.length !== 1 || overlayOpen()) return;
      var t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable], #lightbox')) return;
      sc = scrollerOf(t);
      if (sc.scrollTop > 0) return;
      y0 = e.touches[0].clientY; pull = 0; active = false; decided = false;
    }, { passive: true });
    d.addEventListener('touchmove', function (e) {
      if (y0 === null) return;
      if (e.touches.length !== 1) { y0 = null; return; }
      var dy = e.touches[0].clientY - y0;
      if (!decided) {
        if (Math.abs(dy) < 4) return;
        decided = true;
        if (dy < 0 || sc.scrollTop > 0) { y0 = null; return; }     /* scrolling down the page as usual */
        active = true; bar.classList.add('on');
      }
      if (!active) return;
      if (e.cancelable) e.preventDefault();                          /* the page stays put: the menu stays glued to the top */
      pull = Math.min(MAX, Math.max(0, dy) * 0.5);
      var p = Math.min(1, pull / NEED);
      bar.style.transform = 'translateY(' + (pull * 0.75).toFixed(1) + 'px)';
      if (p >= 1 && !bar.classList.contains('ready')) haptic();
      bar.classList.toggle('ready', p >= 1);
      fill.style.width = (p * 100).toFixed(1) + '%';
    }, { passive: false });
    function end() {
      if (!active) { y0 = null; return; }
      active = false; y0 = null;
      if (pull >= NEED) { fill.style.width = '100%'; setTimeout(function () { location.reload(); }, 160); return; }
      bar.classList.remove('on', 'ready'); bar.style.transform = ''; fill.style.width = '0%';
    }
    d.addEventListener('touchend', end, { passive: true });
    d.addEventListener('touchcancel', end, { passive: true });
  }

  function start() { grain(); cursor(); pullToRefresh(); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();
})();
