/* NOEASY · site.js — the film grain and the ring cursor, shared by every page.

   GRAIN. One 256×256 noise tile is drawn once, when the page opens, and becomes the
   background of <div id="grain">. CSS then jumps the layer to a new offset ten times a
   second. Moving a layer is the graphics card's job, so the processor stays free —
   the old canvas redrew every pixel of the screen sixty times a second.
   data-alpha on #grain = how strong the grain is (0–255, default 22).
   Each page sets the layer's z-index itself (the gallery keeps it under the works).
   Reduced motion: the grain stays still.

   CURSOR. A thin ring follows the mouse and shrinks on click. Only on devices with a
   mouse (hover + fine pointer); phones and tablets never get it. */
(function () {
  'use strict';
  var d = document, w = window;

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
    '@media (prefers-reduced-motion:reduce){#cursor{transition:opacity .2s}}';
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
    if (!w.matchMedia || !w.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
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
    d.documentElement.addEventListener('mouseleave', function () { c.classList.remove('active'); });
    w.addEventListener('blur', function () { c.classList.remove('active', 'pressed'); });
  }

  function start() { grain(); cursor(); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();
})();
