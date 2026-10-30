/* NOEASY · incense.js — the incense smoke behind the gallery (WebGL1, no libraries).

   DAYLIGHT (the feed): milky veils a shade lighter than the parchment, with faint warm-grey
   strands along their edges. The smoke rises on its own; scrolling speeds it up for a moment and
   carries it up with the page, then it settles within a second. It is never tinted by the paintings.

   THE VIEWER: when a painting opens, the room goes dark — warm umber — and the same smoke shows
   as light wisps, the way incense does in a dim church. window.noeasyIncense.dim(true|false) does it;
   setDark(0..1) follows a finger while the viewer is being swiped away.

   The canvas sits behind the works (z-index 1) and moves just under the viewer (9998) while it is open.
   Half resolution, 30 frames a second while something moves, 15 at rest, nothing in a background tab.
   Reduced motion: a still frame. No WebGL: nothing is drawn and the viewer keeps its own dark background. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var NOFX = { on: false, dim: function () { return Promise.resolve(); }, setDark: function () {} };
  w.noeasyIncense = NOFX;
  var mq = w.matchMedia ? w.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mq && mq.matches); }

  var style = d.createElement('style');
  style.textContent =
    '#incense{position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:1;pointer-events:none;display:block}' +
    'html.incense-dim #incense{z-index:9998}';
  d.head.appendChild(style);
  var canvas = d.createElement('canvas');
  canvas.id = 'incense';
  canvas.setAttribute('aria-hidden', 'true');
  d.body.insertBefore(canvas, d.body.firstChild);

  var gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false,
      stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  } catch (e) { gl = null; }
  if (!gl) { canvas.remove(); return; }

  var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';
  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec2 uRes;uniform float uTime;uniform float uScroll;uniform float uLight;uniform float uDark;',
    'float hash(vec2 p){p=fract(p*0.6180339887);p*=25.0;return fract(p.x*p.y*(p.x+p.y));}',
    'float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}',
    'const mat2 m=mat2(0.80,0.60,-0.60,0.80);',
    'float fbm(vec2 p){float f=0.0;',
    ' f+=0.5000*noise(p);p=m*p*2.02;f+=0.2500*noise(p);p=m*p*2.03;',
    ' f+=0.1250*noise(p);p=m*p*2.01;f+=0.0625*noise(p);',
    ' return f/0.9375;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes.y;',
    ' float t=uTime;',
    /* taller shapes (the smoke rises in columns); the field drifts up, scrolling carries it with the page */
    ' vec2 p=vec2(uv.x*1.2,uv.y*0.75-t*0.05-uScroll);',
    ' vec2 q=vec2(fbm(p+vec2(0.0,t*0.02)),fbm(p+vec2(5.2,1.3)-vec2(t*0.015,0.0)));',
    ' vec2 r=vec2(fbm(p+3.0*q+vec2(1.7,9.2)+vec2(0.0,t*0.04)),fbm(p+3.0*q+vec2(8.3,2.8)-vec2(t*0.03,0.0)));',
    ' float f=fbm(p+2.2*r);',
    ' float lift=mix(1.0,0.55,clamp(gl_FragCoord.y/uRes.y,0.0,1.0));',   /* denser low, thinner high */
    ' float veil=smoothstep(0.46,0.86,f)*(0.45+0.55*clamp(length(q)-0.30,0.0,1.0));',
    ' float ridge=1.0-abs(2.0*f-1.0);',                                       /* the veils' curling edges */
    ' float strand=pow(ridge,10.0)*smoothstep(0.25,0.75,length(r)-0.2);',
    ' vec3 col;float a;float k;',
    ' vec2 v=gl_FragCoord.xy/uRes-0.5;',
    /* the viewer: warm darkness, a little lighter in the middle, and the smoke as light wisps */
    ' col=vec3(0.078,0.058,0.042)*(1.0-dot(v,v)*0.9)*uDark;a=uDark;',
    ' k=(veil*0.26+strand*0.30)*uDark;',
    ' col=vec3(0.86,0.81,0.72)*k+col*(1.0-k);a=k+a*(1.0-k);',
    /* daylight: milky veils, faint warm-grey strands */
    ' k=veil*0.46*lift*uLight;',
    ' col=vec3(0.992,0.980,0.950)*k+col*(1.0-k);a=k+a*(1.0-k);',
    ' k=strand*0.13*lift*uLight;',
    ' col=vec3(0.42,0.375,0.315)*k+col*(1.0-k);a=k+a*(1.0-k);',
    /* film grain in the dark (the page grain lies under the viewer) */
    ' float g=(hash(gl_FragCoord.xy+fract(uTime*7.31)*vec2(91.7,37.3))-0.5)*0.035*uDark;',
    ' col=clamp(col+vec3(g)*a,vec3(0.0),vec3(a));',
    ' gl_FragColor=vec4(col,a);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('incense:', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  var vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) { canvas.remove(); return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = {};
  ['uRes', 'uTime', 'uScroll', 'uLight', 'uDark'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

  var SCALE = 0.5;                      /* the smoke is soft: half resolution is enough */
  var width = 0, height = 0;
  var flow = 40;                        /* start mid-flow, not from the first frame of the noise */
  var boost = 0, light = 1, dark = 0, dimmed = false;
  var lastY = w.scrollY || 0, lastScrollAt = -1e9, lastDraw = 0, raf = 0, tw = null;

  /* the page may already show the viewer (a link straight to a painting) */
  if (root.classList.contains('lb-is-open')) { dimmed = true; light = 0; dark = 1; root.classList.add('incense-dim'); }

  function size() {
    var cw = Math.max(2, Math.round(canvas.clientWidth * SCALE));
    var ch = Math.max(2, Math.round(canvas.clientHeight * SCALE));
    if (cw !== width || ch !== height) {
      width = cw; height = ch; canvas.width = cw; canvas.height = ch;
      gl.viewport(0, 0, cw, ch);
    }
  }
  function draw() {
    size();
    gl.uniform2f(U.uRes, width, height);
    gl.uniform1f(U.uTime, flow);
    gl.uniform1f(U.uScroll, (w.scrollY || 0) / Math.max(1, w.innerHeight) * 0.35);
    gl.uniform1f(U.uLight, light);
    gl.uniform1f(U.uDark, dark);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function ease(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function tween(key, to, ms) {
    return new Promise(function (resolve) {
      if (tw) tw.done();
      if (reduced() || !(ms > 0)) {
        if (key === 'dark') dark = to; else light = to;
        draw(); resolve(); return;
      }
      tw = { key: key, from: key === 'dark' ? dark : light, to: to, t0: performance.now(), ms: ms,
             done: function () { tw = null; resolve(); } };
      wake();
    });
  }
  function stepTween(now) {
    if (!tw) return;
    var k = Math.min(1, (now - tw.t0) / tw.ms), v = tw.from + (tw.to - tw.from) * ease(k);
    if (tw.key === 'dark') dark = v; else light = v;
    if (k >= 1) tw.done();
  }

  function loop(now) {
    raf = 0;
    if (d.hidden) return;
    var busy = tw || dimmed || boost > 0.02 || now - lastScrollAt < 1500;
    if (now - lastDraw >= (busy ? 31 : 64)) {
      var dt = lastDraw ? Math.min(0.1, (now - lastDraw) / 1000) : 0;
      lastDraw = now;
      boost *= Math.exp(-dt / 0.45);
      if (!reduced()) flow += dt * (1 + 1.8 * boost);
      stepTween(now);
      draw();
    }
    if (!reduced() || tw) raf = w.requestAnimationFrame(loop);
  }
  function wake() { if (!raf && !d.hidden) raf = w.requestAnimationFrame(loop); }

  w.addEventListener('scroll', function () {
    var now = performance.now(), y = w.scrollY || 0;
    var v = Math.abs(y - lastY) / Math.max(16, now - lastScrollAt) * 1000;   /* px per second */
    lastY = y; lastScrollAt = now;
    boost = Math.max(boost, Math.min(2.5, v / 900));
    if (reduced()) draw(); else wake();
  }, { passive: true });
  w.addEventListener('resize', function () { draw(); });
  d.addEventListener('visibilitychange', function () { if (!d.hidden) { lastDraw = 0; wake(); } });
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { draw(); wake(); });
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    if (raf) w.cancelAnimationFrame(raf);
    raf = 0;
    root.classList.remove('incense-on', 'incense-dim');
    canvas.remove();
    w.noeasyIncense = NOFX;
  });

  w.noeasyIncense = {
    on: true,
    /* on: the room goes dark for the viewer; off: the light comes back and the canvas returns behind the works */
    dim: function (on, ms) {
      if (on) {
        dimmed = true;
        light = 0;
        draw();                               /* clear the daylight veils before the canvas moves above the feed */
        root.classList.add('incense-dim');
        return tween('dark', 1, ms == null ? 480 : ms);
      }
      dimmed = false;
      return tween('dark', 0, ms == null ? 420 : ms).then(function () {
        if (dimmed) return;                   /* opened again meanwhile */
        root.classList.remove('incense-dim');
        light = 0;
        return tween('light', 1, 600);
      });
    },
    setDark: function (v) {
      if (tw) tw.done();
      dark = Math.max(0, Math.min(1, v));
      draw();
    },
    /* the page jumped by itself (closing the viewer brings the painting back into view): no gust of smoke */
    still: function () { lastY = w.scrollY || 0; }
  };
  root.classList.add('incense-on');
  draw();
  wake();
})();
