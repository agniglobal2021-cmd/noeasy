/* Волчок — лента «Новое» на главной. GSAP 3 + ScrollTrigger.
   Экран стоит на месте, вещи сменяются прокруткой: одна вещь — один шаг.
   Каждая вещь собрана из вертикалей: название, пять полос карточки, цена, ссылка.
   Каждая вертикаль — окно. При смене старая строка уходит вверх из своего окна, новая поднимается
   в него снизу, как барабан; окна срабатывают по очереди (на широком экране слева направо,
   на узком сверху вниз), а вещь в ковчеге проявляется последней. Короткий жест доводит
   до следующей вещи. Без скрипта и при «уменьшить движение» вещи идут лентой одна под другой (это CSS). */
(() => {
  const root = document.documentElement;
  const feed = document.querySelector('.feed');
  if (!feed) return;
  if (!window.gsap || !window.ScrollTrigger) { root.classList.remove('feed-on'); return; }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const slides = gsap.utils.toArray('.slide', feed);
  const n = slides.length;
  const things = n - 1;                       // the last card opens the catalog
  const nowEl = feed.querySelector('.feed__now');
  const ofEl = feed.querySelector('.feed__of');
  const steps = [...feed.querySelectorAll('.feed__step')];
  const intro = document.querySelector('.intro');
  const STEP = 0.9;                           // scroll for one thing, in screens
  const TEXT = ['name', 'price', 'more'];

  const parts = slides.map((s) => {
    const p = { win: {}, faces: [...s.querySelectorAll('.strip .face')], arts: [...s.querySelectorAll('.strip .face__art')] };
    TEXT.forEach((key) => {
      p.win[key] = s.querySelector('.s-' + key);
      p[key] = p.win[key] && p.win[key].querySelector('.roll');
    });
    p.win.strips = [...s.querySelectorAll('.strip')];
    return p;
  });

  let st = null;
  let current = -1;
  const setCurrent = (k) => {
    if (k === current) return;
    current = k;
    if (k < things) { nowEl.textContent = String(k + 1); ofEl.textContent = '\u00a0из ' + things; }
    else { nowEl.textContent = ''; ofEl.textContent = ''; }
    slides.forEach((s, i) => {
      s.classList.toggle('is-current', i === k);
      s.classList.toggle('is-near', Math.abs(i - k) === 1);
    });
    if (steps[0]) steps[0].disabled = k === 0;
    if (steps[1]) steps[1].disabled = k === n - 1;
  };
  const scrollToThing = (k, smooth) => {
    if (!st) return;
    k = Math.max(0, Math.min(n - 1, k));
    window.scrollTo({ top: Math.ceil(st.labelToScroll('s' + k)), behavior: smooth ? 'smooth' : 'auto' });
  };
  steps.forEach((b) => b.addEventListener('click', () => scrollToThing(current + Number(b.dataset.step), true)));
  // a link reached with Tab inside a card that is not on screen brings its card on screen
  feed.addEventListener('focusin', (e) => {
    const s = e.target.closest('.slide');
    if (!st || !s) return;
    const k = slides.indexOf(s);
    if (k !== current) scrollToThing(k, false);
  });

  const mm = gsap.matchMedia();
  mm.add({
    motion: '(prefers-reduced-motion: no-preference)',
    wide: '(min-aspect-ratio: 1001/1000)',
  }, (ctx) => {
    const { motion, wide } = ctx.conditions;
    if (!motion) { root.classList.remove('feed-on', 'feed-ready'); return; }
    root.classList.add('feed-on');

    const V = () => innerHeight;
    // when each window turns inside one step (one thing = 1 on the timeline)
    const O = wide
      ? { name: 0, card: 0.08, price: 0.32, more: 0.36 }
      : { card: 0, name: 0.26, price: 0.32, more: 0.36 };
    const D = 0.6;      // how long one window takes to turn
    const LAG = 0.05;   // between neighbouring strips of the card
    // a line travels its own height plus the window's padding, so it clears the window completely
    const clear = (el) => () => parseFloat(getComputedStyle(el.parentNode).paddingTop) + 1;

    /* 1. the first screen lifts away as the feed comes up */
    if (intro) {
      gsap.timeline({ scrollTrigger: { trigger: intro, start: 'top top', end: 'bottom top', scrub: 0.35 } })
        .to('.intro__name', { y: () => -0.16 * V(), autoAlpha: 0.15, ease: 'none' }, 0)
        .to('.intro__line', { y: () => -0.1 * V(), autoAlpha: 0, ease: 'none', duration: 0.6 }, 0)
        .to('.intro__cue', { autoAlpha: 0, ease: 'none', duration: 0.3 }, 0);
      ScrollTrigger.create({
        trigger: intro, start: 'top top', end: 'bottom top',
        snap: { snapTo: 1, directional: true, inertia: false, duration: { min: 0.3, max: 0.8 }, delay: 0.04, ease: 'power2.inOut' },
      });
    }

    /* 2. while the feed rises, the windows of the first thing lag behind it a little, each more than the last */
    const p0 = parts[0];
    const order0 = wide ? ['name', 'card', 'price', 'more'] : ['card', 'name', 'price', 'more'];
    const enter = gsap.timeline({
      scrollTrigger: { trigger: feed, start: 'top bottom', end: 'top top', scrub: 0.35, invalidateOnRefresh: true },
      defaults: { ease: 'power2.out', duration: 1 },
    });
    let k = 0;
    order0.forEach((key) => {
      if (key === 'card') {
        p0.win.strips.forEach((el) => { const share = 0.1 + k * 0.035; enter.from(el, { y: () => share * V() }, 0); k += 1; });
      } else if (p0.win[key]) {
        const share = 0.1 + k * 0.035;
        enter.from(p0.win[key], { y: () => share * V() }, 0);
        k += 1;
      }
    });

    /* 3. the stage: one thing per step, every window turns in its turn */
    const tl = gsap.timeline({ defaults: { ease: 'power3.inOut', duration: D } });
    for (let i = 0; i < n - 1; i++) {
      const a = parts[i], b = parts[i + 1];
      tl.addLabel('s' + i, i);
      TEXT.forEach((key) => {
        if (!a[key] || !b[key]) return;
        const ca = clear(a[key]), cb = clear(b[key]);
        tl.to(a[key], { yPercent: -100, y: () => -ca() }, i + O[key]);
        tl.fromTo(b[key], { yPercent: 100, y: cb }, { yPercent: 0, y: 0 }, i + O[key]);
      });
      a.faces.forEach((el, j) => {
        const t = i + O.card + j * LAG;
        tl.to(el, { yPercent: -100 }, t);
        tl.fromTo(b.faces[j], { yPercent: 100 }, { yPercent: 0 }, t);
        // the thing sinks into the field before its board leaves, and surfaces once the new board is in
        tl.to(a.arts[j], { autoAlpha: 0, yPercent: -10, duration: D * 0.45, ease: 'power2.in' }, t);
        tl.fromTo(b.arts[j], { autoAlpha: 0, yPercent: 12 }, { autoAlpha: 1, yPercent: 0, duration: D * 0.6, ease: 'power2.out' }, t + D * 0.5);
      });
    }
    tl.addLabel('s' + (n - 1), n - 1);

    st = ScrollTrigger.create({
      trigger: feed,
      start: 'top top',
      end: () => '+=' + Math.round((n - 1) * V() * STEP),
      pin: true,
      anticipatePin: 1,
      scrub: 0.35,
      animation: tl,
      invalidateOnRefresh: true,
      snap: { snapTo: 'labelsDirectional', inertia: false, duration: { min: 0.25, max: 0.75 }, delay: 0.04, ease: 'power1.inOut' },
      onUpdate: (self) => setCurrent(Math.round(self.progress * (n - 1))),
    });
    setCurrent(Math.round(st.progress * (n - 1)));
    root.classList.add('feed-ready');

    return () => {
      st = null; current = -1;
      root.classList.remove('feed-ready');
      slides.forEach((s) => s.classList.remove('is-current', 'is-near'));
    };
  });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.VOLCHOK_FEED = true;
})();
