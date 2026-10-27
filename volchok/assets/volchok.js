/* Волчок — прототип, черновик 2. Без библиотек. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* menu on a phone */
  $$('.menu-toggle').forEach((btn) => {
    const wrap = btn.closest('.nav-wrap');
    btn.addEventListener('click', () => {
      const open = wrap.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Закрыть' : 'Меню';
    });
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('.nav a')) { wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'Меню'; }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrap.classList.contains('is-open')) { wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'Меню'; btn.focus(); }
    });
  });

  /* arrivals, once */
  const seen = $$('[data-rise], [data-open], .shelf, .group, .rows--rise');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    seen.forEach((el) => io.observe(el));
  } else seen.forEach((el) => el.classList.add('is-in'));

  /* the name answers the scroll: the hero wordmark settles a few percent, the footer one grows into place */
  const heroName = $('.hero__name svg');
  const heroImg = $('.hero__photo img');
  const hero = $('.hero');
  const footName = $('.footer__name svg');
  const bandImg = $('.band__frame img');
  const page = $('.page');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const vh = innerHeight;
    if (hero && heroName) {
      const h = hero.offsetHeight;
      const p = Math.min(Math.max(scrollY / (h * 0.85), 0), 1);
      heroName.style.scale = String(1 - 0.06 * p);
      if (heroImg) heroImg.style.translate = `0 ${(p * 0.06 * heroImg.parentElement.offsetHeight).toFixed(1)}px`;
    }
    if (bandImg) {
      const r = bandImg.parentElement.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        const p = (vh - r.top) / (vh + r.height); // 0 entering, 1 leaving
        bandImg.style.translate = `0 ${((p - 0.5) * 0.08 * r.height).toFixed(1)}px`;
      }
    }
    if (footName && page) {
      const uncovered = vh - page.getBoundingClientRect().bottom;
      const p = Math.min(Math.max(uncovered / (vh * 0.9), 0), 1);
      footName.style.scale = String(0.94 + 0.06 * p);
    }
  };
  if (!reduce) {
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    addEventListener('resize', onScroll);
    onScroll();
  }

  /* «Мечи»: the colourway tabs swap the plate */
  const tabs = $$('.mechi .tab');
  const plate = $('#mechi-plate img');
  const colourNote = $('.mechi__colour');
  const pick = (tab) => {
    const c = tab.dataset.colour;
    tabs.forEach((t) => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    $('#mechi-plate').setAttribute('aria-labelledby', tab.id);
    if (colourNote) colourNote.textContent = colourNote.dataset['colour' + c[0].toUpperCase() + c.slice(1)];
    const src = plate.dataset[c];
    if (plate.getAttribute('src') === src) return;
    const swap = () => { plate.src = src; plate.alt = plate.dataset['alt' + c[0].toUpperCase() + c.slice(1)]; };
    if (reduce) { swap(); return; }
    plate.classList.add('is-swapping');
    const pre = new Image(); pre.src = src;
    const done = () => { swap(); requestAnimationFrame(() => plate.classList.remove('is-swapping')); };
    setTimeout(() => (pre.decode ? pre.decode().then(done, done) : done()), 200);
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => pick(tab));
    tab.addEventListener('pointerenter', () => { const im = new Image(); im.src = plate.dataset[tab.dataset.colour]; }, { once: true });
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); pick(next);
    });
  });

  /* «Крутани волчок»: the spiral spins and stops on a real thing from the shop */
  const items = window.VOLCHOK_ITEMS || [];
  const spinSec = $('#spin');
  if (spinSec && items.length) {
    const svg = $('.spin__disc svg', spinSec);
    const list = $('.drops', spinSec);
    const fact = $('.spin__fact', spinSec);
    const go = $('.spin__go', spinSec);
    go.hidden = false;
    const fmt = (n) => n.toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽';
    const show = (i) => {
      const [name, price, old, href, cat] = items[i];
      fact.innerHTML = '';
      const pr = document.createElement('span'); pr.className = 'price';
      if (old) { const s = document.createElement('s'); s.textContent = fmt(old); pr.append(s, ' '); }
      pr.append(fmt(price));
      const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = cat;
      const a = document.createElement('a'); a.className = 'link'; a.href = href;
      a.textContent = href.startsWith('http') ? 'Смотреть на volchok.ru' : 'Смотреть вещь';
      fact.append(pr, meta, document.createElement('br'), a);
      $$('button', list).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.item === i)));
    };
    list.addEventListener('click', (e) => { const b = e.target.closest('button[data-item]'); if (b) show(+b.dataset.item); });

    let angle = 0, spinning = false, visible = false, last = performance.now();
    const idleSpeed = 360 / 48; // degrees a second
    const draw = () => { svg.style.transform = `rotate(${angle.toFixed(2)}deg)`; };
    const idle = (t) => {
      const dt = Math.min(t - last, 64) / 1000; last = t;
      if (!spinning && visible) { angle = (angle + idleSpeed * dt) % 360; draw(); }
      requestAnimationFrame(idle);
    };
    if (!reduce) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(spinSec);
      requestAnimationFrame((t) => { last = t; requestAnimationFrame(idle); });
    }

    const slot = () => {
      const li = document.createElement('li'); li.className = 'is-new';
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      li.append(b); list.prepend(li);
      while (list.children.length > 5) list.lastElementChild.remove();
      return b;
    };
    const land = (b, i) => { b.dataset.item = String(i); b.textContent = items[i][0]; show(i); };
    const spin = () => {
      if (spinning) return;
      const shown = new Set($$('button[data-item]', list).map((b) => +b.dataset.item));
      let i; do { i = Math.floor(Math.random() * items.length); } while (shown.has(i) && shown.size < items.length);
      const b = slot();
      if (reduce) { land(b, i); return; }
      spinning = true; go.disabled = true;
      $$('button', list).forEach((x) => x.setAttribute('aria-pressed', 'false'));
      const from = angle, turn = 1080 + Math.random() * 360, dur = 2600, t0 = performance.now();
      const ease = (x) => 1 - Math.pow(1 - x, 4);
      let flick = 0;
      const step = (t) => {
        const x = Math.min((t - t0) / dur, 1);
        angle = from + turn * ease(x); draw();
        // names roll past like a roulette and slow down with the top
        if (x < 0.9 && t - flick > 50 + 300 * x) { flick = t; b.textContent = items[Math.floor(Math.random() * items.length)][0]; }
        if (x < 1) requestAnimationFrame(step);
        else { angle %= 360; spinning = false; go.disabled = false; land(b, i); }
      };
      requestAnimationFrame(step);
    };
    $$('[data-spin]', spinSec).forEach((b) => b.addEventListener('click', spin));
  }

  /* catalog filters */
  const filters = $$('.filter');
  if (filters.length) {
    const groups = $$('.group');
    const apply = (f, push) => {
      filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
      groups.forEach((g) => {
        let any = false;
        $$('.rows li', g).forEach((li) => {
          const on = f === 'all' || f === g.dataset.group || (f === 'mechi' && li.hasAttribute('data-mechi'));
          li.hidden = !on; if (on) any = true;
        });
        g.hidden = !any;
        if (any) g.classList.add('is-in');
      });
      if (push) {
        const u = new URL(location.href);
        if (f === 'all') u.searchParams.delete('f'); else u.searchParams.set('f', f);
        history.replaceState(null, '', u);
      }
    };
    filters.forEach((b) => b.addEventListener('click', () => apply(b.dataset.f, true)));
    $$('[data-filter-link]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault(); apply(a.dataset.filterLink, true);
      $('.filters').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }));
    const f0 = new URL(location.href).searchParams.get('f');
    if (f0 && filters.some((b) => b.dataset.f === f0)) apply(f0, false);
  }
})();
