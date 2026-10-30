/* NOEASY · ink.js — sepia ink on the parchment behind the gallery (WebGL2, no libraries).

   When a work comes into view, a drop of ink falls by its window, half under the frame. Water carries
   the pigment out through the wet paper; the front frays along the paper fibres, pigment drifts to the
   drying edge and leaves a darker rim, the damp paper darkens a little and dries back. Dried pigment
   sinks into the paper; old stains pale over the minutes but never vanish completely.
   Scrolling drags the still-wet ink into trails; on a computer the cursor stirs it.

   How: stable fluids (semi-Lagrangian advection, vorticity confinement, pressure projection) on a coarse
   velocity grid; the ink grid keeps mobile pigment (r), settled pigment (g) and water (b); the paper and
   the pigment are drawn with Beer–Lambert absorption, so overlapping washes deepen like real ink.
   The ink lives a layer below the paper: it moves at 60% of the scroll, so it never lags behind the works.

   Cost: half-float textures at 1/3 (ink) and 1/8 (water flow) of the screen; 30 steps a second while
   something is wet or moving, a redraw on each scrolled frame, nothing at all at rest or in a hidden tab.
   The picture itself is drawn at up to 2 pixels per css px (phones), within ~2.2 million pixels.
   Reduced motion, no WebGL2 or no float render targets: no canvas, the page keeps its plain parchment.

   API for the page: window.noeasyInk.drop(domRect) — a drop by this window (the work's window rect);
   window.noeasyInk.pause(true|false) — while the viewer covers the page. */
(function () {
  'use strict';
  var d = document, w = window;
  var NOOP = { on: false, drop: function () {}, pause: function () {} };
  w.noeasyInk = NOOP;
  if (w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var style = d.createElement('style');
  style.textContent = '#ink{position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:1;pointer-events:none;display:block}';
  d.head.appendChild(style);
  var canvas = d.createElement('canvas');
  canvas.id = 'ink';
  canvas.setAttribute('aria-hidden', 'true');
  d.body.insertBefore(canvas, d.body.firstChild);

  var gl = null;
  try {
    gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  } catch (e) { gl = null; }
  if (!gl) { canvas.remove(); return; }
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');

  /* ---------- shaders ---------- */
  var VS = '#version 300 es\nin vec2 aPos;out vec2 vUv;void main(){vUv=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}';
  var HEAD = [
    '#version 300 es',
    'precision highp float;',
    'precision highp sampler2D;',
    'in vec2 vUv;',
    'out vec4 o;',
    'float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*0.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}',
    'float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);}',
    ''
  ].join('\n');

  /* water flow: follow the page, carry itself, wander, take the scroll drag and the cursor; none on dry paper */
  var FS_VEL = HEAD + [
    'uniform sampler2D uVel;uniform sampler2D uInk;',
    'uniform vec2 uPx;uniform vec2 uCss;uniform float uDt;uniform float uShift;uniform float uDamp;uniform float uTime;',
    'uniform vec2 uDrag;uniform vec4 uPtr;uniform float uPtrR;uniform float uWander;',
    'void main(){',
    ' vec2 p=vUv-vec2(0.0,uShift);',
    ' if(p.y<0.0||p.y>1.0){o=vec4(0.0);return;}',
    ' vec2 v=texture(uVel,p).xy;',
    ' v=texture(uVel,p-uDt*v*uPx).xy*uDamp;',
    ' float g=smoothstep(0.02,0.3,texture(uInk,p).b);',
    ' vec2 n=vUv*uCss/62.0+vec2(uTime*0.05,uTime*0.03);',
    ' float e=0.07;',
    ' vec2 curl=vec2(vnoise(n+vec2(0.0,e))-vnoise(n-vec2(0.0,e)),vnoise(n-vec2(e,0.0))-vnoise(n+vec2(e,0.0)))/(2.0*e);',
    ' v+=curl*uWander*uDt*g;',
    ' v+=uDrag*uDt*g;',
    ' vec2 dp=(vUv-uPtr.xy)*uCss;',
    ' v+=uPtr.zw*exp(-dot(dp,dp)/(uPtrR*uPtrR))*g;',
    ' o=vec4(v*g,0.0,1.0);',
    '}'
  ].join('\n');
  var FS_CURL = HEAD + [
    'uniform sampler2D uVel;uniform vec2 uT;',
    'void main(){',
    ' float L=texture(uVel,vUv-vec2(uT.x,0.0)).y;float R=texture(uVel,vUv+vec2(uT.x,0.0)).y;',
    ' float B=texture(uVel,vUv-vec2(0.0,uT.y)).x;float T=texture(uVel,vUv+vec2(0.0,uT.y)).x;',
    ' o=vec4(0.5*(R-L-T+B),0.0,0.0,1.0);',
    '}'
  ].join('\n');
  var FS_VORT = HEAD + [
    'uniform sampler2D uVel;uniform sampler2D uCurl;uniform vec2 uT;uniform float uEps;uniform float uDt;',
    'void main(){',
    ' float L=texture(uCurl,vUv-vec2(uT.x,0.0)).x;float R=texture(uCurl,vUv+vec2(uT.x,0.0)).x;',
    ' float B=texture(uCurl,vUv-vec2(0.0,uT.y)).x;float T=texture(uCurl,vUv+vec2(0.0,uT.y)).x;',
    ' float C=texture(uCurl,vUv).x;',
    ' vec2 f=0.5*vec2(abs(T)-abs(B),abs(R)-abs(L));',
    ' f/=length(f)+0.0001;f*=uEps*C;f.y=-f.y;',
    ' o=vec4(texture(uVel,vUv).xy+f*uDt,0.0,1.0);',
    '}'
  ].join('\n');
  var FS_DIV = HEAD + [
    'uniform sampler2D uVel;uniform vec2 uT;',
    'void main(){',
    ' float L=texture(uVel,vUv-vec2(uT.x,0.0)).x;float R=texture(uVel,vUv+vec2(uT.x,0.0)).x;',
    ' float B=texture(uVel,vUv-vec2(0.0,uT.y)).y;float T=texture(uVel,vUv+vec2(0.0,uT.y)).y;',
    ' o=vec4(0.5*(R-L+T-B),0.0,0.0,1.0);',
    '}'
  ].join('\n');
  var FS_JACOBI = HEAD + [
    'uniform sampler2D uP;uniform sampler2D uDiv;uniform vec2 uT;',
    'void main(){',
    ' float L=texture(uP,vUv-vec2(uT.x,0.0)).x;float R=texture(uP,vUv+vec2(uT.x,0.0)).x;',
    ' float B=texture(uP,vUv-vec2(0.0,uT.y)).x;float T=texture(uP,vUv+vec2(0.0,uT.y)).x;',
    ' o=vec4((L+R+B+T-texture(uDiv,vUv).x)*0.25,0.0,0.0,1.0);',
    '}'
  ].join('\n');
  var FS_GRAD = HEAD + [
    'uniform sampler2D uP;uniform sampler2D uVel;uniform vec2 uT;',
    'void main(){',
    ' float L=texture(uP,vUv-vec2(uT.x,0.0)).x;float R=texture(uP,vUv+vec2(uT.x,0.0)).x;',
    ' float B=texture(uP,vUv-vec2(0.0,uT.y)).x;float T=texture(uP,vUv+vec2(0.0,uT.y)).x;',
    ' o=vec4(texture(uVel,vUv).xy-0.5*vec2(R-L,T-B),0.0,1.0);',
    '}'
  ].join('\n');
  var FS_SCALE = HEAD + 'uniform sampler2D uSrc;uniform float uK;void main(){o=vec4(texture(uSrc,vUv).xyz*uK,1.0);}';

  /* the ink: r = pigment still in the water, g = pigment settled in the paper, b = water */
  var FS_INK = HEAD + [
    'uniform sampler2D uInk;uniform sampler2D uVel;',
    'uniform vec2 uPx;uniform vec2 uT;uniform vec2 uCss;',
    'uniform float uDt;uniform float uShift;uniform float uDiff;uniform float uWetDiff;uniform float uEvap;',
    'uniform float uFix;uniform float uFixWet;uniform float uFade;uniform float uFloor;uniform float uEdge;uniform float uOffPx;',
    'void main(){',
    ' vec2 p=vUv-vec2(0.0,uShift);',
    ' if(p.y<0.0||p.y>1.0){o=vec4(0.0,0.0,0.0,1.0);return;}',
    ' vec4 c=texture(uInk,p);',
    ' vec4 nL=texture(uInk,p-vec2(uT.x,0.0));vec4 nR=texture(uInk,p+vec2(uT.x,0.0));',
    ' vec4 nB=texture(uInk,p-vec2(0.0,uT.y));vec4 nT=texture(uInk,p+vec2(0.0,uT.y));',
    ' float mob=smoothstep(0.08,0.45,c.b);',
    /* water flows out to where it evaporates fastest, the edge, and takes pigment with it: the rim */
    ' vec2 gw=vec2(nR.b-nL.b,nT.b-nB.b);',
    ' float gl=length(gw);',
    ' vec2 edge=-gw/(gl+0.0001)*smoothstep(0.012,0.06,gl)*uEdge*mob*(1.0-smoothstep(0.25,0.95,c.b));',
    ' vec2 v=texture(uVel,p).xy*mob+edge;',
    ' vec4 a=texture(uInk,p-uDt*v*uPx);',
    ' float R=a.r;',
    ' float B=mix(c.b,a.b,mob);',
    /* pigment spreads only through wet paper; the fibres make the front ragged */
    ' vec2 cp=vec2(p.x*uCss.x,p.y*uCss.y-uOffPx);',
    ' float fib=0.25+1.5*vnoise(vec2(cp.x/7.0+cp.y/19.0,cp.y/4.0));',
    ' float fw=0.2+1.6*vnoise(cp/11.0+vec2(31.7,7.3));',
    ' float k=clamp(uDiff*uDt,0.0,0.24)*fib;',
    ' R+=k*(smoothstep(0.08,0.2,min(c.b,nL.b))*(nL.r-c.r)+smoothstep(0.08,0.2,min(c.b,nR.b))*(nR.r-c.r)+smoothstep(0.08,0.2,min(c.b,nB.b))*(nB.r-c.r)+smoothstep(0.08,0.2,min(c.b,nT.b))*(nT.r-c.r));',
    ' B+=clamp(uWetDiff*uDt,0.0,0.2)*fw*(nL.b+nR.b+nB.b+nT.b-4.0*c.b);',
    ' B=max(B*exp(-uDt/uEvap)-0.01*uDt,0.0);',
    /* pigment sinks into the paper: slowly while wet, at once when dry */
    ' float s=mix(uFix,uFixWet,smoothstep(0.0,0.3,B));',
    ' float t=max(R,0.0)*clamp(s*uDt,0.0,1.0);',
    ' R=max(R-t,0.0);',
    ' float G=c.g+t;',
    /* old stains pale but never vanish */
    ' if(G>uFloor)G=uFloor+(G-uFloor)*exp(-uDt/uFade);',
    ' o=vec4(min(R,2.5),min(G,2.5),clamp(B,0.0,3.0),1.0);',
    '}'
  ].join('\n');

  /* a drop: ragged disc of pigment, a wider ring of water around it (water takes the max: drops do not flood) */
  var FS_DROP = HEAD + [
    'uniform sampler2D uInk;uniform vec2 uPoint;uniform vec2 uCss;uniform float uR;uniform float uInkAmt;uniform float uWetAmt;uniform float uSeed;',
    'void main(){',
    ' vec4 c=texture(uInk,vUv);',
    ' vec2 dp=(vUv-uPoint)*uCss;',
    ' vec2 dir=dp/(length(dp)+0.0001);',
    ' float rn=0.7+0.5*vnoise(dir*1.7+vec2(uSeed,uSeed*1.7))+0.16*vnoise(dp/uR*3.4+uSeed);',
    ' float r=length(dp)/(uR*rn);',
    ' float ink=uInkAmt*(1.0-smoothstep(0.72,1.0,r));',
    ' float wet=uWetAmt*(1.0-smoothstep(1.02,1.14,r));',
    ' o=vec4(c.r+ink,c.g,max(c.b,wet),1.0);',
    '}'
  ].join('\n');

  /* the page: parchment with its tooth and fibres, damp where wet, the pigment by Beer–Lambert */
  var FS_SHOW = HEAD + [
    'uniform sampler2D uInk;uniform vec2 uT;uniform vec2 uCss;uniform float uFrac;',
    'uniform vec3 uPaper;uniform vec3 uK;uniform vec3 uKTail;uniform float uRim;uniform float uOffPx;',
    'const vec2 D0=vec2(1.0,0.0);const vec2 D1=vec2(0.7071,0.7071);const vec2 D2=vec2(0.0,1.0);const vec2 D3=vec2(-0.7071,0.7071);',
    'float dens(vec2 q){vec4 s=texture(uInk,q);return s.r+s.g;}',
    /* B-spline bicubic from four bilinear fetches: the ink is stored in 3 px cells, this keeps edges curved, not stepped */
    'vec4 cubic(float v){vec4 n=vec4(1.0,2.0,3.0,4.0)-v;vec4 s=n*n*n;float x=s.x;float y=s.y-4.0*s.x;float z=s.z-4.0*s.y+6.0*s.x;return vec4(x,y,z,6.0-x-y-z)*(1.0/6.0);}',
    'vec4 bicubic(vec2 uv){vec2 ts=1.0/uT;uv=uv*ts-0.5;vec2 f=fract(uv);uv-=f;vec4 xc=cubic(f.x);vec4 yc=cubic(f.y);',
    ' vec4 c=uv.xxyy+vec2(-0.5,1.5).xyxy;vec4 s=vec4(xc.xz+xc.yw,yc.xz+yc.yw);vec4 off=(c+vec4(xc.yw,yc.yw)/s)*uT.xxyy;',
    ' vec4 s0=texture(uInk,off.xz);vec4 s1=texture(uInk,off.yz);vec4 s2=texture(uInk,off.xw);vec4 s3=texture(uInk,off.yw);',
    ' float sx=s.x/(s.x+s.y);float sy=s.z/(s.z+s.w);return mix(mix(s3,s2,sx),mix(s1,s0,sx),sy);}',
    'void main(){',
    ' vec2 uv=vUv-vec2(0.0,uFrac);',
    ' vec4 c=bicubic(uv);',
    ' float de=c.r+c.g;',
    ' vec2 r=uT*2.6;',
    ' float m=(dens(uv+D0*r)+dens(uv-D0*r)+dens(uv+D1*r)+dens(uv-D1*r)+dens(uv+D2*r)+dens(uv-D2*r)+dens(uv+D3*r)+dens(uv-D3*r))*0.125;',
    ' vec2 px=vUv*uCss-vec2(0.0,uOffPx);',
    ' float tooth=vnoise(px*0.9)*0.6+vnoise(px*0.31)*0.4;',
    ' float floc=vnoise(px*0.17+vec2(5.1,9.7));',
    ' float fib=vnoise(vec2(px.x*0.12+px.y*0.05,px.y*0.33-px.x*0.08));',
    /* the pigment stops at a threshold that wanders with the paper: a crisp, ragged edge out of soft data,
       and just inside it a darker line where the pigment piled up as the water dried */
    ' float th=0.03+0.07*vnoise(px*0.21+vec2(2.3,8.1));',
    ' float inside=smoothstep(th,th+0.045,de);',
    ' float band=inside*(1.0-smoothstep(th+0.05,th+0.32,de));',
    ' float rim=(clamp(de-m,0.0,0.8)+band*0.22)*inside;',
    ' float wet=smoothstep(0.08,0.6,c.b);',
    /* granulation: settled pigment gathers in the tooth of the paper and in small clumps */
    ' float g=(c.g*(1.0+0.95*(tooth-0.5)+0.55*(floc-0.5))+c.r*(1.0+0.3*(tooth-0.5)))*inside;',
    ' float e=min(g+rim*uRim,2.3);',
    ' vec3 k=mix(uKTail,uK,smoothstep(0.0,0.45,e));',
    ' vec3 paper=uPaper*(1.0+(fib-0.5)*0.01+(tooth-0.5)*0.014)*(1.0-0.05*wet);',
    ' o=vec4(paper*exp(-k*e),1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('ink:', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  var vsh = compile(gl.VERTEX_SHADER, VS);
  function program(fs) {
    var f = compile(gl.FRAGMENT_SHADER, fs);
    if (!vsh || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vsh); gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('ink:', gl.getProgramInfoLog(p)); return null; }
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }
  var P = {
    vel: program(FS_VEL), curl: program(FS_CURL), vort: program(FS_VORT), div: program(FS_DIV),
    jacobi: program(FS_JACOBI), grad: program(FS_GRAD), scale: program(FS_SCALE),
    ink: program(FS_INK), drop: program(FS_DROP), show: program(FS_SHOW)
  };
  for (var k in P) if (!P[k]) { canvas.remove(); return; }

  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  /* ---------- render targets ---------- */
  function target(wd, ht) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, wd, ht, 0, gl.RGBA, gl.HALF_FLOAT, null);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    gl.viewport(0, 0, wd, ht);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: t, fb: f, w: wd, h: ht };
  }
  function pair(wd, ht) {
    var a = target(wd, ht), b = target(wd, ht);
    if (!a || !b) return null;
    return { read: a, write: b, swap: function () { var t = this.read; this.read = this.write; this.write = t; } };
  }
  function free(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }

  var INK_CELL = 3, VEL_CELL = 8;          /* css px per cell */
  var cssW = 0, cssH = 0, inkW = 0, inkH = 0, velW = 0, velH = 0;
  var ink = null, vel = null, prs = null, divT = null, curlT = null;

  function build() {
    var cw = Math.max(2, canvas.clientWidth), ch = Math.max(2, canvas.clientHeight);
    if (cw === cssW && ch === cssH && ink) return true;
    cssW = cw; cssH = ch;
    /* the paper and the ink are drawn sharp on phone screens (up to 2 pixels per css px), within ~2.2 million
       pixels on big screens */
    var ds = Math.min(Math.min(2, w.devicePixelRatio || 1), Math.sqrt(2.2e6 / (cssW * cssH)));
    canvas.width = Math.max(1, Math.round(cssW * ds)); canvas.height = Math.max(1, Math.round(cssH * ds));
    [ink && ink.read, ink && ink.write, vel && vel.read, vel && vel.write, prs && prs.read, prs && prs.write, divT, curlT].forEach(free);
    inkW = Math.min(640, Math.ceil(cssW / INK_CELL)); inkH = Math.min(640, Math.ceil(cssH / INK_CELL));
    velW = Math.min(240, Math.ceil(cssW / VEL_CELL)); velH = Math.min(240, Math.ceil(cssH / VEL_CELL));
    ink = pair(inkW, inkH); vel = pair(velW, velH); prs = pair(velW, velH);
    if (typeof offApplied === 'number') { offApplied = offTotal; shiftAcc = 0; }
    divT = target(velW, velH); curlT = target(velW, velH);
    return !!(ink && vel && prs && divT && curlT);
  }
  if (!build()) { canvas.remove(); return; }

  function run(prog, out, uniforms, textures) {
    gl.useProgram(prog.p);
    var unit = 0;
    for (var name in textures) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, textures[name].tex);
      gl.uniform1i(prog.u[name], unit++);
    }
    for (var n in uniforms) {
      var v = uniforms[n], loc = prog.u[n];
      if (loc == null) continue;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
      else gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
    }
    if (out) { gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb); gl.viewport(0, 0, out.w, out.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------- state ---------- */
  var STEP = 1 / 30, DEPTH = 0.6;
  var PAPER = [0.9098, 0.8784, 0.7686];              /* #e8e0c4, the page colour */
  var K = [0.56, 0.78, 1.02], K_TAIL = [0.36, 0.66, 1.08];   /* sepia: deep cores, warmer thin edges */
  var simTime = 37, acc = 0, last = 0, raf = 0, paused = false;
  var shiftAcc = 0, lastY = w.scrollY || 0, lastScrollT = 0, scrollUntil = 0;
  var offTotal = 0, offApplied = 0;      /* how far the ink layer has travelled with the page, css px: in total / already in the textures */
  var wetUntil = 0, flowUntil = 0, dragV = 0, ptr = null, queue = [];

  function velStep(shiftUv) {
    var tv = [1 / velW, 1 / velH];
    var p = ptr ? [ptr.x, ptr.y, ptr.vx, ptr.vy] : [0, 0, 0, 0];
    ptr = null;
    run(P.vel, vel.write, { uPx: [1 / cssW, 1 / cssH], uCss: [cssW, cssH], uDt: STEP, uShift: shiftUv,
      uDamp: Math.exp(-STEP / 0.55), uTime: simTime, uDrag: [0, -dragV * 0.35], uPtr: p, uPtrR: 70, uWander: 140 },
      { uVel: vel.read, uInk: ink.read });
    vel.swap();
    run(P.curl, curlT, { uT: tv }, { uVel: vel.read });
    run(P.vort, vel.write, { uT: tv, uEps: 1.8, uDt: STEP }, { uVel: vel.read, uCurl: curlT });
    vel.swap();
    run(P.div, divT, { uT: tv }, { uVel: vel.read });
    run(P.scale, prs.write, { uK: 0.8 }, { uSrc: prs.read });
    prs.swap();
    for (var i = 0; i < 14; i++) { run(P.jacobi, prs.write, { uT: tv }, { uP: prs.read, uDiv: divT }); prs.swap(); }
    run(P.grad, vel.write, { uT: tv }, { uP: prs.read, uVel: vel.read });
    vel.swap();
  }
  function inkStep(shiftUv, offPrev) {
    run(P.ink, ink.write, { uPx: [1 / cssW, 1 / cssH], uT: [1 / inkW, 1 / inkH], uCss: [cssW, cssH], uDt: STEP,
      uShift: shiftUv, uOffPx: offPrev, uDiff: 3.2, uWetDiff: 0.9, uEvap: 4.2, uFix: 2.5, uFixWet: 0.1, uFade: 150, uFloor: 0.1, uEdge: 18 },
      { uInk: ink.read, uVel: vel.read });
    ink.swap();
  }
  function splat(dp) {
    run(P.drop, ink.write, { uPoint: [dp.x / cssW, 1 - (dp.cy - offApplied) / cssH], uCss: [cssW, cssH], uR: dp.r,
      uInkAmt: dp.ink, uWetAmt: dp.wet, uSeed: dp.seed }, { uInk: ink.read });
    ink.swap();
  }
  function show() {
    run(P.show, null, { uT: [1 / inkW, 1 / inkH], uCss: [cssW, cssH], uFrac: shiftAcc / inkH,
      uPaper: PAPER, uK: K, uKTail: K_TAIL, uRim: 1.3, uOffPx: offTotal }, { uInk: ink.read });
  }

  /* one step of the simulation; the page shift is applied in whole ink cells, the rest is drawn as an offset */
  function step(now) {
    var n = shiftAcc >= 0 ? Math.floor(shiftAcc) : Math.ceil(shiftAcc);
    shiftAcc -= n;
    var shiftUv = n / inkH, offPrev = offApplied;
    offApplied += n * cssH / inkH;
    var wet = now < wetUntil;
    if (wet || now < flowUntil) velStep(shiftUv);
    if (wet || n !== 0) inkStep(shiftUv, offPrev);
    while (queue.length && queue[0].t <= now) { splat(queue.shift()); wetUntil = Math.max(wetUntil, now + 30000); }
    simTime += STEP;
    dragV *= Math.exp(-STEP / 0.25);
  }

  function frame(now) {
    raf = 0;
    if (paused || d.hidden) return;
    var dt = last ? Math.min(0.1, (now - last) / 1000) : STEP;
    last = now;
    var busy = queue.length || now < wetUntil || now < flowUntil;
    var drew = false;
    if (busy) {
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < 2) { step(now); acc -= STEP; steps++; drew = true; }
      if (steps === 2) acc = 0;
    } else if (Math.abs(shiftAcc) >= 1) { step(now); drew = true; }
    if (drew || now < scrollUntil) show();
    if (busy || now < scrollUntil || Math.abs(shiftAcc) >= 1) raf = w.requestAnimationFrame(frame);
    else last = 0;
  }
  function wake() { if (!raf && !paused && !d.hidden) raf = w.requestAnimationFrame(frame); }

  w.addEventListener('scroll', function () {
    var y = w.scrollY || 0, dy = y - lastY;
    lastY = y;
    if (!dy) return;
    var now = performance.now(), dt = Math.max(16, now - lastScrollT);
    lastScrollT = now;
    offTotal += dy * DEPTH;
    shiftAcc = (offTotal - offApplied) * inkH / cssH;
    dragV = Math.max(-2500, Math.min(2500, dy * DEPTH / dt * 1000));
    scrollUntil = now + 160;
    if (now < wetUntil) flowUntil = Math.max(flowUntil, now + 1200);
    wake();
  }, { passive: true });

  if (w.matchMedia && w.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var px = -1, py = -1, pt = 0;
    w.addEventListener('pointermove', function (e) {
      var now = performance.now();
      if (px >= 0 && now - pt < 120) {
        var k = 1000 / Math.max(8, now - pt);
        ptr = { x: e.clientX / cssW, y: 1 - e.clientY / cssH,
                vx: Math.max(-900, Math.min(900, (e.clientX - px) * k)) * 0.35,
                vy: Math.max(-900, Math.min(900, -(e.clientY - py) * k)) * 0.35 };
        if (now < wetUntil) { flowUntil = Math.max(flowUntil, now + 1500); wake(); }
      }
      px = e.clientX; py = e.clientY; pt = now;
    }, { passive: true });
  }

  w.addEventListener('resize', function () {
    if (canvas.clientWidth === cssW && canvas.clientHeight === cssH) return;
    if (!build()) { canvas.remove(); w.noeasyInk = NOOP; return; }
    show();
  });
  d.addEventListener('visibilitychange', function () { if (!d.hidden) { last = 0; wake(); } });
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    if (raf) w.cancelAnimationFrame(raf);
    raf = 0; paused = true;
    canvas.remove();
    w.noeasyInk = NOOP;
  });

  /* drops by a window: half under the frame, at its side where there is room, else at a corner */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  w.noeasyInk = {
    on: true,
    drop: function (rect) {
      if (!rect || !(rect.width > 0)) return;
      var now = performance.now();
      var r = Math.max(34, Math.min(120, rect.width * 0.17));
      var room = Math.min(rect.left, cssW - rect.right);
      var side = Math.random() < 0.5 ? -1 : 1, x, y;
      if (room > r * 0.9) {
        x = side < 0 ? rect.left + r * 0.2 : rect.right - r * 0.2;
        y = rect.top + rect.height * rnd(0.3, 0.85);
      } else {
        x = side < 0 ? rect.left + rect.width * rnd(0.08, 0.3) : rect.right - rect.width * rnd(0.08, 0.3);
        y = Math.random() < 0.6 ? rect.bottom - r * 0.15 : rect.top + r * 0.15;
      }
      var t0 = Math.max(now, queue.length ? queue[queue.length - 1].t + 260 : now);
      queue.push({ t: t0, x: x, cy: y + offTotal, r: r, ink: rnd(0.85, 1.15), wet: 1, seed: rnd(0, 100) });
      /* a few spatters around it */
      var n = Math.floor(rnd(0, 3));
      for (var i = 0; i < n; i++) {
        var a = rnd(0, Math.PI * 2), dist = r * rnd(1.25, 2.1), rs = r * rnd(0.09, 0.18);
        queue.push({ t: t0 + rnd(30, 160), x: x + Math.cos(a) * dist, cy: y + Math.sin(a) * dist + offTotal, r: rs,
                     ink: rnd(0.9, 1.3), wet: 0.8, seed: rnd(0, 100) });
      }
      queue.sort(function (p, q) { return p.t - q.t; });
      wake();
    },
    pause: function (on) {
      paused = !!on;
      if (paused) { if (raf) w.cancelAnimationFrame(raf); raf = 0; last = 0; }
      else { lastY = w.scrollY || 0; wake(); }
    }
  };
  show();
})();
