/* NOEASY · site.js — shared by every page: the film grain, the ring cursor, pull-to-refresh and the
   Windows 95 scrollbar.

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
   the page itself does not move. Let go when the bar is full and the page reloads.

   SCROLLBAR. Windows 95, in the site's colours: raised arrow buttons, a raised thumb, a dithered
   track. Computers get it as the browser's own scrollbar, styled. Phones and tablets draw no
   scrollbars of their own, so there the same scrollbar is built from page elements: drag the
   thumb, tap the arrows or the track. The page scrolls in the usual way either way.
   A page whose content scrolls inside a window (About) marks that element with data-w95-scroll. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var fine = !!(w.matchMedia && w.matchMedia('(hover: hover) and (pointer: fine)').matches);
  var touch = 'ontouchstart' in w || (navigator.maxTouchPoints || 0) > 0;
  var home = /^\/(index\.html)?$/.test(location.pathname);

  /* Win95 scrollbar parts, 16×16, drawn pixel by pixel */
  function svg(body, wd, ht) {
    return "url(\"data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='" + (wd || 16) + "' height='" + (ht || 16) + "' shape-rendering='crispEdges'>" + body + '</svg>') + "\")";
  }
  var RAISED = "<rect width='16' height='16' fill='#2a2520'/><rect width='15' height='15' fill='#d4cdc4'/>" +
               "<rect x='1' y='1' width='14' height='14' fill='#7a7068'/><rect x='1' y='1' width='13' height='13' fill='#e6e0d4'/>" +
               "<rect x='2' y='2' width='12' height='12' fill='#AFA191'/>";
  var PRESSED = "<rect width='16' height='16' fill='#7a7068'/><rect x='1' y='1' width='14' height='14' fill='#AFA191'/>";
  function arrow(dir, dx) {
    var r = [], c = "fill='#1a1612'";
    for (var i = 0; i < 4; i++) {
      var len = 2 * i + 1, a = 7 - i + dx, b = (dir === 'up' || dir === 'left' ? 6 + i : 9 - i) + dx;
      r.push(dir === 'up' || dir === 'down'
        ? "<rect x='" + a + "' y='" + b + "' width='" + len + "' height='1' " + c + '/>'
        : "<rect x='" + b + "' y='" + a + "' width='1' height='" + len + "' " + c + '/>');
    }
    return r.join('');
  }
  var BTN = {}, dirs = ['up', 'down', 'left', 'right'];
  for (var k = 0; k < 4; k++) {
    BTN[dirs[k]] = svg(RAISED + arrow(dirs[k], 0));
    BTN[dirs[k] + 'P'] = svg(PRESSED + arrow(dirs[k], 1));
  }
  var TRACK = svg("<rect width='2' height='2' fill='#AFA191'/><rect width='1' height='1' fill='#d4cdc4'/><rect x='1' y='1' width='1' height='1' fill='#d4cdc4'/>", 2, 2);
  var TRACK_P = svg("<rect width='2' height='2' fill='#7a7068'/><rect width='1' height='1' fill='#AFA191'/><rect x='1' y='1' width='1' height='1' fill='#AFA191'/>", 2, 2);
  var THUMB = 'background:#AFA191;box-shadow:inset -1px -1px 0 #2a2520,inset 1px 1px 0 #d4cdc4,inset -2px -2px 0 #7a7068,inset 2px 2px 0 #e6e0d4';

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
    /* computers: the browser's own scrollbar, styled as Windows 95 */
    '@media (hover:hover) and (pointer:fine){' +
      '::-webkit-scrollbar{width:16px;height:16px}' +
      '::-webkit-scrollbar-track{background:' + TRACK + ' 0 0/2px 2px repeat}' +
      '::-webkit-scrollbar-track:active{background:' + TRACK_P + ' 0 0/2px 2px repeat}' +
      '::-webkit-scrollbar-thumb{' + THUMB + '}' +
      '::-webkit-scrollbar-button{display:block;width:16px;height:16px;background-size:16px 16px}' +
      '::-webkit-scrollbar-button:vertical:start:increment,::-webkit-scrollbar-button:vertical:end:decrement,' +
      '::-webkit-scrollbar-button:horizontal:start:increment,::-webkit-scrollbar-button:horizontal:end:decrement{display:none}' +
      '::-webkit-scrollbar-button:vertical:start:decrement{background-image:' + BTN.up + '}' +
      '::-webkit-scrollbar-button:vertical:start:decrement:active{background-image:' + BTN.upP + '}' +
      '::-webkit-scrollbar-button:vertical:end:increment{background-image:' + BTN.down + '}' +
      '::-webkit-scrollbar-button:vertical:end:increment:active{background-image:' + BTN.downP + '}' +
      '::-webkit-scrollbar-button:horizontal:start:decrement{background-image:' + BTN.left + '}' +
      '::-webkit-scrollbar-button:horizontal:start:decrement:active{background-image:' + BTN.leftP + '}' +
      '::-webkit-scrollbar-button:horizontal:end:increment{background-image:' + BTN.right + '}' +
      '::-webkit-scrollbar-button:horizontal:end:increment:active{background-image:' + BTN.rightP + '}' +
      '::-webkit-scrollbar-corner{background:#AFA191}' +
    '}' +
    /* Firefox styles no scrollbar parts: just its colours */
    '@supports not selector(::-webkit-scrollbar){html{scrollbar-color:#AFA191 #d4cdc4}}' +
    /* phones and tablets: the same scrollbar, drawn */
    '.w95sb{position:fixed;z-index:490;width:16px;display:none;flex-direction:column;touch-action:none;-webkit-user-select:none;user-select:none}' +
    '.w95sb.on{display:flex}' +
    '.w95sb b{position:relative;flex:0 0 16px;height:16px;background-size:16px 16px}' +
    '.w95sb .up{background-image:' + BTN.up + '}.w95sb .up.press{background-image:' + BTN.upP + '}' +
    '.w95sb .down{background-image:' + BTN.down + '}.w95sb .down.press{background-image:' + BTN.downP + '}' +
    '.w95sb i{position:relative;flex:1 1 auto;display:block;background:' + TRACK + ' 0 0/2px 2px repeat}' +
    '.w95sb i.press{background:' + TRACK_P + ' 0 0/2px 2px repeat}' +
    '.w95sb s{position:absolute;left:0;top:0;width:16px;min-height:20px;' + THUMB + ';will-change:transform}' +
    'html.w95sb-doc body{margin-right:16px}' +
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

  /* an open menu, filter panel, viewer or dialog owns the touch: no pulling, no scrollbar updates */
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
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable], .w95sb, #lightbox')) return;
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

  /* the drawn scrollbar for touch screens */
  function drawnScrollbar() {
    if (fine || !touch) return;
    var host = d.querySelector('[data-w95-scroll]');
    var sc = host || docScroller(), isDoc = !host;
    var bar = d.createElement('div');
    bar.className = 'w95sb';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<b class="up"></b><i><s></s></i><b class="down"></b>';
    d.body.appendChild(bar);
    var up = bar.children[0], track = bar.children[1], thumb = track.firstChild, down = bar.children[2];
    var shown = false, trackLen = 0, thumbLen = 0, raf = 0;

    function place() {
      if (isDoc) {
        var hd = d.querySelector('header'), top = 0;
        if (hd && getComputedStyle(hd).position === 'fixed') top = Math.max(0, hd.getBoundingClientRect().bottom);
        bar.style.cssText = 'top:' + top + 'px;right:0;bottom:0';
      } else {
        var r = host.getBoundingClientRect();
        bar.style.cssText = 'top:' + r.top + 'px;left:' + (r.right - 16) + 'px;height:' + r.height + 'px';
      }
    }
    function update() {
      raf = 0;
      if (overlayOpen()) return;
      var max = sc.scrollHeight - sc.clientHeight;
      var want = max > 2;     /* narrowing the page for the bar only makes it taller: no flicker */
      if (want !== shown) {
        shown = want;
        bar.classList.toggle('on', shown);
        if (isDoc) root.classList.toggle('w95sb-doc', shown);
        if (shown) place();
        max = sc.scrollHeight - sc.clientHeight;
      }
      if (!shown) return;
      if (!isDoc) place();      /* the window may still be sliding in */
      trackLen = track.clientHeight;
      thumbLen = Math.max(20, Math.round(trackLen * sc.clientHeight / Math.max(1, sc.scrollHeight)));
      var y = max > 0 ? Math.round((trackLen - thumbLen) * sc.scrollTop / max) : 0;
      thumb.style.height = thumbLen + 'px';
      thumb.style.transform = 'translateY(' + y + 'px)';
    }
    function later() { if (!raf) raf = w.requestAnimationFrame(update); }
    (isDoc ? w : host).addEventListener('scroll', later, { passive: true });
    w.addEventListener('resize', function () { if (shown) place(); later(); });
    if (w.ResizeObserver) {
      var ro = new ResizeObserver(later);
      ro.observe(isDoc ? d.body : (host.firstElementChild || host));
    }

    function nudge(px) { sc.scrollTop = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, sc.scrollTop + px)); }
    function hold(el, fn) {
      var timer = 0, rep = 0;
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation();
        el.classList.add('press'); fn(e);
        timer = setTimeout(function () { rep = setInterval(function () { fn(e); }, 50); }, 350);
      });
      function stop() { el.classList.remove('press'); clearTimeout(timer); clearInterval(rep); }
      el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop); el.addEventListener('pointerleave', stop);
    }
    hold(up, function () { nudge(-48); });
    hold(down, function () { nudge(48); });
    hold(track, function (e) {
      var r = thumb.getBoundingClientRect();
      if (e.clientY < r.top) nudge(-sc.clientHeight * 0.85);
      else if (e.clientY > r.bottom) nudge(sc.clientHeight * 0.85);
    });
    var dragY = 0, dragTop = 0;
    thumb.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      dragY = e.clientY; dragTop = sc.scrollTop;
      try { thumb.setPointerCapture(e.pointerId); } catch (x) {}
      thumb.dataset.drag = '1';
    });
    thumb.addEventListener('pointermove', function (e) {
      if (!thumb.dataset.drag) return;
      var room = trackLen - thumbLen;
      if (room > 0) sc.scrollTop = dragTop + (e.clientY - dragY) * (sc.scrollHeight - sc.clientHeight) / room;
    });
    function release() { delete thumb.dataset.drag; }
    thumb.addEventListener('pointerup', release); thumb.addEventListener('pointercancel', release);
    later();
    w.addEventListener('load', later);
  }

  function start() { grain(); cursor(); pullToRefresh(); drawnScrollbar(); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();
})();
