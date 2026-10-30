/* NOEASY · ink.js — sepia ink on the parchment behind the gallery (WebGL2, no libraries).

   The paper is old: stains dried long ago lie all over it, from specks to huge pale washes. They belong
   to the paper itself, so the same place on the page always has the same stains.
   When a work comes into view, fresh ink falls by its window, half under the frame: one or two drops
   and a few spatters, now and then a big one. Water carries the pigment out through the wet paper; the
   front frays along the paper fibres, pigment drifts to the drying edge and leaves a darker rim, the damp
   paper darkens a little and dries back. Dried pigment sinks into the paper; fresh stains pale over the
   minutes but never vanish completely. Scrolling drags the still-wet ink into trails; on a computer the
   cursor stirs it. All of it is a thin, see-through wash: the darkest line is the tide line at the edge.

   How: stable fluids (semi-Lagrangian advection, vorticity confinement, pressure projection) on a coarse
   velocity grid; the ink grid keeps mobile pigment (r), settled pigment (g) and water (b); the paper and
   the pigment are drawn with Beer–Lambert absorption, so overlapping washes deepen like real ink.
   The ink lives a layer below the paper: it moves at 60% of the scroll, so it never lags behind the works.

   Cost: half-float textures at 1/3 (ink) and 1/8 (water flow) of the screen; 30 steps a second while
   something is wet or moving, a redraw on each scrolled frame, nothing at all at rest or in a hidden tab.
   The picture itself is drawn at up to 2 pixels per css px (phones), within ~2.2 million pixels.
   Old stains are worked out once when the page opens, then only for the strip of paper that scrolls in.
   Reduced motion, no WebGL2 or no float render targets: no canvas, the page keeps its plain parchment.

   API for the page: window.noeasyInk.drop(domRect) — fresh ink by this window (the work's window rect);
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

  /* old stains: scattered on four grids in the paper's own coordinates (css px of the ink layer), so any
     place gets the same stains whenever it comes back into view. Each is a lobed, slightly oval blot: a pale,
     uneven wash inside and the pigment piled up at its edge where it dried, like the fresh ones.
     Specks and small blots (grid 150), middle ones (330), large ones (700), huge pale washes (1100). */
  var OLD = [
    'uniform float uOld;',
    'float blot(vec2 cp,vec2 cell,float S,float prob,float r0,float r1,float a0,float a1,float salt,float zoned){',
    ' vec2 k=cell+salt;',
    /* small ones gather in some places and leave others clean, as on real paper */
    ' float zone=mix(1.0,0.25+1.5*smoothstep(0.3,0.75,vnoise((cell+0.5)*S/1500.0+vec2(3.3,8.1))),zoned);',
    ' if(hash(k*1.31+vec2(4.1,7.7))>prob*uOld*zone)return 0.0;',
    ' vec2 ctr=(cell+0.15+0.7*vec2(hash(k+vec2(1.3,9.1)),hash(k+vec2(8.7,2.9))))*S;',
    ' float R=mix(r0,r1,pow(hash(k+vec2(5.5,3.1)),1.6));',
    ' vec2 dp=cp-ctr;',
    ' if(dot(dp,dp)>R*R*1.9)return 0.0;',
    ' float seed=hash(k+vec2(2.2,6.6))*100.0;',
    ' float an=seed*0.0628;vec2 cs=vec2(cos(an),sin(an));',
    ' vec2 q=vec2(dot(dp,cs),dot(dp,vec2(-cs.y,cs.x)));',
    ' q.y*=1.0+0.35*hash(k+vec2(9.9,1.1));',
    ' float d=length(q);vec2 dir=q/(d+0.0001);',
    ' float rn=0.72+0.4*vnoise(dir*1.7+vec2(seed,seed*1.7))+0.14*vnoise(q/R*3.4+seed)+0.08*vnoise(dir*5.0+seed*2.3);',
    ' float r=d/(R*rn);',
    /* not two alike: some nearly clear inside with only a ring, some a full wash, some blooms that fade towards
       their edge instead of a ring. Every edge is a clean cut well above the drawing threshold, so pale washes
       stay smooth instead of breaking into speckles. */
    ' float soft=step(hash(k+vec2(6.1,2.4)),0.2);',
    ' float body=1.0-smoothstep(0.96,1.0,r);',
    ' float wash=max(mix(0.12,0.6,hash(k+vec2(7.3,5.2)))+0.3*(vnoise(q/R*2.2+seed*0.37)-0.5),0.34)*(1.0+0.9*soft);',
    ' wash*=mix(1.0,0.45*smoothstep(0.2,0.96,r)+(1.0-smoothstep(0.2,0.96,r)),soft);',
    ' float ring=(1.0-soft)*mix(0.25,0.7,hash(k+vec2(0.7,8.8)))*smoothstep(0.76,0.97,r);',
    ' return mix(a0,a1,hash(k+vec2(3.7,4.4)))*body*max(wash+ring,0.0);',
    '}',
    'float oldInk(vec2 cp){',
    ' float s=0.0;',
    ' vec2 c1=floor(cp/150.0);vec2 c2=floor(cp/330.0);vec2 c3=floor(cp/700.0);vec2 c4=floor(cp/1100.0);',
    ' for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){',
    '  vec2 of=vec2(float(i),float(j));',
    '  s+=blot(cp,c1+of,150.0,0.8,4.0,55.0,0.75,1.15,0.0,1.0);',
    '  s+=blot(cp,c2+of,330.0,0.45,40.0,130.0,0.65,1.0,17.0,1.0);',
    '  s+=blot(cp,c3+of,700.0,0.5,110.0,260.0,0.6,0.9,29.0,0.0);',
    '  s+=blot(cp,c4+of,1100.0,0.6,280.0,560.0,0.5,0.7,41.0,0.0);',
    ' }',
    ' return s;',
    '}',
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

  /* the ink: r = pigment still in the water, g = pigment settled in the paper, b = water, a = the old stains */
  var FS_INK = HEAD + OLD + [
    'uniform sampler2D uInk;uniform sampler2D uVel;',
    'uniform vec2 uPx;uniform vec2 uT;uniform vec2 uCss;',
    'uniform float uDt;uniform float uShift;uniform float uDiff;uniform float uWetDiff;uniform float uEvap;',
    'uniform float uFix;uniform float uFixWet;uniform float uFade;uniform float uFloor;uniform float uEdge;uniform float uOffPx;',
    'void main(){',
    ' vec2 p=vUv-vec2(0.0,uShift);',
    ' vec2 cp=vec2(p.x*uCss.x,p.y*uCss.y-uOffPx);',
    /* paper that scrolls into view comes with its own old stains, dry */
    ' if(p.y<0.0||p.y>1.0){o=vec4(0.0,0.0,0.0,oldInk(cp));return;}',
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
    /* fresh stains pale but never vanish; the old ones (a) stay as they are */
    ' if(G>uFloor)G=uFloor+(G-uFloor)*exp(-uDt/uFade);',
    ' o=vec4(min(R,2.5),min(G,2.5),clamp(B,0.0,3.0),c.a);',
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
    ' o=vec4(c.r+ink,c.g,max(c.b,wet),c.a);',
    '}'
  ].join('\n');

  /* the paper as it is when the page opens (and after a resize): only its old stains */
  var FS_INIT = HEAD + OLD + [
    'uniform vec2 uCss;uniform float uOffPx;',
    'void main(){o=vec4(0.0,0.0,0.0,oldInk(vec2(vUv.x*uCss.x,vUv.y*uCss.y-uOffPx)));}'
  ].join('\n');

  /* the page: parchment with its tooth and fibres, damp where wet, the pigment by Beer–Lambert */
  var FS_SHOW = HEAD + [
    'uniform sampler2D uInk;uniform vec2 uT;uniform vec2 uCss;uniform float uFrac;',
    'uniform vec3 uPaper;uniform vec3 uK;uniform vec3 uKTail;uniform float uRim;uniform float uOffPx;uniform float uBody;uniform float uLine;',
    'const vec2 D0=vec2(1.0,0.0);const vec2 D1=vec2(0.7071,0.7071);const vec2 D2=vec2(0.0,1.0);const vec2 D3=vec2(-0.7071,0.7071);',
    'const mat2 RT=mat2(0.8,0.6,-0.6,0.8);',
    'float dens(vec2 q){vec4 s=texture(uInk,q);return s.r+s.g+s.a;}',
    /* B-spline bicubic from four bilinear fetches: the ink is stored in 3 px cells, this keeps edges curved, not stepped */
    'vec4 cubic(float v){vec4 n=vec4(1.0,2.0,3.0,4.0)-v;vec4 s=n*n*n;float x=s.x;float y=s.y-4.0*s.x;float z=s.z-4.0*s.y+6.0*s.x;return vec4(x,y,z,6.0-x-y-z)*(1.0/6.0);}',
    'vec4 bicubic(vec2 uv){vec2 ts=1.0/uT;uv=uv*ts-0.5;vec2 f=fract(uv);uv-=f;vec4 xc=cubic(f.x);vec4 yc=cubic(f.y);',
    ' vec4 c=uv.xxyy+vec2(-0.5,1.5).xyxy;vec4 s=vec4(xc.xz+xc.yw,yc.xz+yc.yw);vec4 off=(c+vec4(xc.yw,yc.yw)/s)*uT.xxyy;',
    ' vec4 s0=texture(uInk,off.xz);vec4 s1=texture(uInk,off.yz);vec4 s2=texture(uInk,off.xw);vec4 s3=texture(uInk,off.yw);',
    ' float sx=s.x/(s.x+s.y);float sy=s.z/(s.z+s.w);return mix(mix(s3,s2,sx),mix(s1,s0,sx),sy);}',
    'void main(){',
    ' vec2 uv=vUv-vec2(0.0,uFrac);',
    ' vec4 c=bicubic(uv);',
    ' float de=c.r+c.g+c.a;',
    ' vec2 r=uT*2.6;',
    ' float m=(dens(uv+D0*r)+dens(uv-D0*r)+dens(uv+D1*r)+dens(uv-D1*r)+dens(uv+D2*r)+dens(uv-D2*r)+dens(uv+D3*r)+dens(uv-D3*r))*0.125;',
    ' vec2 px=vUv*uCss-vec2(0.0,uOffPx);',
    /* the grain of the paper and the clumps of pigment: octaves turned against each other, so no grid shows */
    ' float tooth=vnoise(RT*px*0.62)*0.55+vnoise(RT*RT*px*0.29+vec2(3.7,1.9))*0.45;',
    ' float floc=vnoise(RT*px*0.14+vec2(5.1,9.7))*0.6+vnoise(px*0.083+vec2(1.3,4.4))*0.4;',
    ' float fib=vnoise(vec2(px.x*0.12+px.y*0.05,px.y*0.33-px.x*0.08));',
    /* the pigment stops at a threshold that wanders with the paper: a crisp, ragged edge out of soft data,
       and just inside it a darker line where the pigment piled up as the water dried */
    ' float th=0.03+0.07*vnoise(px*0.21+vec2(2.3,8.1));',
    ' float inside=smoothstep(th,th+0.045,de);',
    ' float band=inside*(1.0-smoothstep(th+0.05,th+0.32,de));',
    ' float rim=(clamp(de-m,0.0,0.8)+band*0.22)*inside;',
    ' float wet=smoothstep(0.08,0.6,c.b);',
    /* granulation: settled pigment gathers in the tooth of the paper and in small clumps */
    ' float g=((c.g+c.a)*(1.0+0.7*(tooth-0.5)+0.5*(floc-0.5))+c.r*(1.0+0.3*(tooth-0.5)))*inside;',
    ' float e=min(g+rim*uRim,2.3);',
    ' vec3 k=mix(uKTail,uK,smoothstep(0.0,0.45,e));',
    ' vec3 paper=uPaper*(1.0+(fib-0.5)*0.01+(tooth-0.5)*0.014)*(1.0-0.05*wet);',
    /* a thin wash: the body of a stain is see-through, its tide line a little darker */
    ' float x=g*uBody+rim*uRim*uLine;',
    /* where washes overlap they deepen, but softly: no dark pools */
    ' float eo=0.95*(1.0-exp(-x/0.95));',
    ' o=vec4(paper*exp(-k*eo),1.0);',
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
    ink: program(FS_INK), drop: program(FS_DROP), init: program(FS_INIT), show: program(FS_SHOW)
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
  /* how many old stains: 1 = as designed, 0 = none */
  var OLD_AMT = 1;
  /* how dark the wash is: the body of a stain, and its tide line (both thin: the stains stay see-through) */
  var BODY = 0.36, LINE = 0.32;
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
    offApplied = offTotal; shiftAcc = 0;
    divT = target(velW, velH); curlT = target(velW, velH);
    if (!(ink && vel && prs && divT && curlT)) return false;
    /* the paper as it is: its old stains, where the layer stands now */
    run(P.init, ink.read, { uCss: [cssW, cssH], uOffPx: offApplied,
      uOld: OLD_AMT }, {});
    return true;
  }
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
  /* how far the ink layer has travelled with the page, css px: in total / already in the textures. It starts
     where the page stands, so a reload at the same place shows the same old stains */
  var offTotal = lastY * DEPTH, offApplied = offTotal;
  var wetUntil = 0, flowUntil = 0, dragV = 0, ptr = null, queue = [];
  if (!build()) { canvas.remove(); return; }

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
      uShift: shiftUv, uOffPx: offPrev, uDiff: 3.2, uWetDiff: 0.9, uEvap: 4.2, uFix: 2.5, uFixWet: 0.1, uFade: 150, uFloor: 0.1, uEdge: 18,
      uOld: OLD_AMT },
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
      uPaper: PAPER, uK: K, uKTail: K_TAIL, uRim: 1.3, uBody: BODY, uLine: LINE, uOffPx: offTotal }, { uInk: ink.read });
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

  /* fresh ink by a window: one or two drops, half under the frame (at its side where there is room, else at a
     corner), each with a few spatters; now and then a big one */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  var recent = [];      /* the latest fresh drops, in the layer's coordinates */
  function crowded(x, cy, r) {
    for (var i = 0; i < recent.length; i++) {
      var p = recent[i], dx = p.x - x, dy = p.cy - cy, m = 0.8 * (p.r + r);
      if (dx * dx + dy * dy < m * m) return true;
    }
    return false;
  }
  function spot(rect, r, side) {
    var room = Math.min(rect.left, cssW - rect.right);
    if (room > r * 0.9) return [side < 0 ? rect.left + r * 0.2 : rect.right - r * 0.2, rect.top + rect.height * rnd(0.2, 0.9)];
    return [side < 0 ? rect.left + rect.width * rnd(0.04, 0.32) : rect.right - rect.width * rnd(0.04, 0.32),
            Math.random() < 0.55 ? rect.bottom - r * rnd(0.05, 0.3) : rect.top + r * rnd(0.05, 0.3)];
  }
  w.noeasyInk = {
    on: true,
    drop: function (rect) {
      if (!rect || !(rect.width > 0)) return;
      var now = performance.now();
      var t = Math.max(now, queue.length ? queue[queue.length - 1].t + 220 : now);
      var side = Math.random() < 0.5 ? -1 : 1, want = Math.random() < 0.6 ? 2 : 1, placed = 0;
      for (var tries = 0; tries < 4 && placed < want; tries++, side = -side) {
        var r = Math.max(22, Math.min(140, rect.width * rnd(0.09, 0.22)));
        if (Math.random() < 0.15) r = Math.min(320, r * rnd(1.8, 2.6));
        var at = spot(rect, r, side), x = at[0], y = at[1], cy = y + offTotal;
        if (crowded(x, cy, r)) continue;          /* fresh ink does not pile up into one dark pool */
        recent.push({ x: x, cy: cy, r: r }); if (recent.length > 40) recent.shift();
        queue.push({ t: t, x: x, cy: cy, r: r, ink: rnd(0.8, 1.15), wet: 1, seed: rnd(0, 100) });
        for (var i = 0, n = Math.floor(rnd(1, 5)); i < n; i++) {
          var a = rnd(0, Math.PI * 2), dist = r * rnd(1.2, 2.3), rs = Math.max(3, r * rnd(0.05, 0.17));
          queue.push({ t: t + rnd(30, 200), x: x + Math.cos(a) * dist, cy: cy + Math.sin(a) * dist, r: rs,
                       ink: rnd(0.9, 1.3), wet: 0.8, seed: rnd(0, 100) });
        }
        placed++; t += rnd(250, 600);
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
