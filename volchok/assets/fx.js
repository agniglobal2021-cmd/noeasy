/* Волчок — фон: медленный дым тёмного пурпура (fbm с искажением пространства) и плёночное зерно.
   WebGL1 без библиотек. Рендер в половину разрешения, не чаще 30 кадров в секунду,
   пауза во вкладке на фоне, один неподвижный кадр при «уменьшить движение». */
(() => {
  const holder = document.querySelector('.fx');
  if (!holder) return;
  const canvas = holder.querySelector('canvas');
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  let gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  } catch (e) { gl = null; }
  if (!gl) { root.classList.add('no-fx'); return; }

  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';
  const FS = [
    'precision mediump float;',
    'uniform vec2 uRes;uniform float uTime;uniform float uScroll;',
    'float hash(vec2 p){p=fract(p*0.6180339887);p*=25.0;return fract(p.x*p.y*(p.x+p.y));}',
    'float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}',
    'const mat2 m=mat2(0.80,0.60,-0.60,0.80);',
    'float fbm(vec2 p){float f=0.0;',
    ' f+=0.5000*noise(p);p=m*p*2.02;f+=0.2500*noise(p);p=m*p*2.03;',
    ' f+=0.1250*noise(p);p=m*p*2.01;f+=0.0625*noise(p);p=m*p*2.04;',
    ' f+=0.03125*noise(p);return f/0.96875;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes.y;',
    ' vec2 p=uv*1.55+vec2(0.0,uScroll);',
    ' float t=uTime*0.032;',
    ' vec2 q=vec2(fbm(p+vec2(0.0,t)),fbm(p+vec2(5.2,1.3)-t*0.7));',
    ' vec2 r=vec2(fbm(p+3.0*q+vec2(1.7,9.2)+t*0.5),fbm(p+3.0*q+vec2(8.3,2.8)-t*0.4));',
    ' float f=fbm(p+2.6*r);',
    ' vec3 deep=vec3(0.050,0.022,0.078);',
    ' vec3 ground=vec3(0.090,0.043,0.129);',
    ' vec3 smoke=vec3(0.205,0.135,0.315);',
    ' vec3 col=mix(deep,ground,smoothstep(0.22,0.55,f));',
    ' col=mix(col,smoke,smoothstep(0.55,0.95,f)*(0.30+0.70*clamp(length(q)-0.35,0.0,1.0)));',
    ' vec2 v=gl_FragCoord.xy/uRes-0.5;col*=1.0-dot(v,v)*0.75;',
    ' float g=hash(gl_FragCoord.xy+fract(uTime*7.31)*vec2(91.7,37.3))-0.5;',
    ' col+=g*0.032;',
    ' gl_FragColor=vec4(col,1.0);',
    '}'
  ].join('\n');

  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) { root.classList.add('no-fx'); return; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { root.classList.add('no-fx'); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uScroll = gl.getUniformLocation(prog, 'uScroll');

  const SCALE = 0.5;               // the smoke is soft: half resolution is enough
  const FRAME = 1000 / 30;
  const t0 = performance.now() - 40000;   // start mid-flow, not from the first frame of the noise
  let raf = 0, last = 0, w = 0, h = 0;

  const size = () => {
    const nw = Math.max(2, Math.round(holder.clientWidth * SCALE));
    const nh = Math.max(2, Math.round(holder.clientHeight * SCALE));
    if (nw !== w || nh !== h) {
      w = nw; h = nh; canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };
  const draw = (now) => {
    size();
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.uniform1f(uScroll, (window.scrollY || 0) / Math.max(1, innerHeight) * 0.12);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME) return;
    last = now;
    draw(now);
  };
  const start = () => { if (!raf && !reduce.matches && !document.hidden) raf = requestAnimationFrame(loop); };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  draw(performance.now());
  root.classList.add('fx-on');
  start();
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduce.addEventListener('change', () => { if (reduce.matches) { stop(); draw(performance.now()); } else start(); });
  addEventListener('resize', () => { if (!raf) draw(performance.now()); });
  addEventListener('scroll', () => { if (!raf && !reduce.matches && !document.hidden) draw(performance.now()); }, { passive: true });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); root.classList.add('no-fx'); });
})();
