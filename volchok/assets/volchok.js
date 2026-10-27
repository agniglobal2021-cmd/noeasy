/* Волчок — прототип оболочки, черновик 3: общее для всех страниц. Без библиотек. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SITE = 'https://volchok.ru';

  /* menu on narrow screens */
  $$('.menu-toggle').forEach((btn) => {
    const wrap = btn.closest('.nav-wrap');
    const set = (open) => {
      wrap.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Закрыть' : 'Меню';
    };
    btn.addEventListener('click', () => set(!wrap.classList.contains('is-open')));
    wrap.addEventListener('click', (e) => { if (e.target.closest('.nav a')) set(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrap.classList.contains('is-open')) { set(false); btn.focus(); }
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target) && wrap.classList.contains('is-open')) set(false); });
  });

  /* header: goes away on the way down, comes back on the way up;
     solid once text runs under it, straw over the footer */
  const top = $('.top');
  const footer = $('.footer');
  const home = document.body.classList.contains('home');
  const afterFeed = $('.cols');
  if (top) {
    let lastY = scrollY, ticking = false;
    const update = () => {
      ticking = false;
      const y = scrollY;
      const h = top.offsetHeight;
      const dy = y - lastY;
      if (Math.abs(dy) > 6) {
        const open = $('.nav-wrap.is-open');
        top.classList.toggle('is-away', dy > 0 && y > h * 2 && !open);
        lastY = y;
      }
      if (y < h) top.classList.remove('is-away');
      const overText = home ? (afterFeed && afterFeed.getBoundingClientRect().top < h) : y > 8;
      top.classList.toggle('is-solid', overText);
      if (footer) top.classList.toggle('on-light', footer.getBoundingClientRect().top < h);
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* arrivals, once */
  const seen = $$('[data-rise], [data-rise-list]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    seen.forEach((el) => io.observe(el));
  } else seen.forEach((el) => el.classList.add('is-in'));

  /* ---------- catalog: all / clothes / accessories / sale ---------- */
  const filters = $$('.filter');
  if (filters.length) {
    const tops = $$('.top-group');
    const apply = (f, push) => {
      if (!filters.some((b) => b.dataset.f === f)) f = 'all';
      filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
      tops.forEach((tg) => {
        const topOn = f === 'all' || f === 'sale' || f === tg.dataset.top;
        let anyTop = false;
        $$('.group', tg).forEach((g) => {
          let any = false;
          $$('.tiles li', g).forEach((li) => {
            const on = topOn && (f !== 'sale' || li.hasAttribute('data-sale'));
            li.hidden = !on; if (on) any = true;
          });
          g.hidden = !any; if (any) anyTop = true;
        });
        tg.hidden = !anyTop;
      });
      if (push) {
        const u = new URL(location.href);
        u.hash = '';
        if (f === 'all') u.searchParams.delete('f'); else u.searchParams.set('f', f);
        history.replaceState(null, '', u);
      }
    };
    filters.forEach((b) => b.addEventListener('click', () => apply(b.dataset.f, true)));
    $$('[data-filter-link]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      apply(a.dataset.filterLink, true);
      $('.filters').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }));
    const f0 = new URL(location.href).searchParams.get('f');
    if (f0) apply(f0, false);
  }

  /* ---------- item page: the thing named in ?id= ---------- */
  const items = window.VOLCHOK_ITEMS;
  const cats = window.VOLCHOK_CATS;
  if (document.body.classList.contains('item-page') && items && cats) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const rub = (n) => n.toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽';
    const priceHTML = (p, old) => (old ? `<s>${rub(old)}</s> ` : '') + rub(p);
    const card = (no, turn, icon, whole) => {
      const art = icon
        ? `<img src="${esc(icon)}" alt="" decoding="async">`
        : `<svg class="spiral" viewBox="7 6 934 603" focusable="false" style="--turn:${turn}deg"><use href="assets/brand.svg#spiral"/></svg>`;
      const face = `<span class="face"><svg class="face__frame" viewBox="0 0 400 500" focusable="false"><use href="assets/frame.svg#frame"/></svg><span class="face__art">${art}</span><svg class="face__no" viewBox="0 0 400 24" focusable="false"><text x="200" y="16.2" text-anchor="middle">№ ${esc(no)}</text></svg></span>`;
      if (whole) return `<span class="card card--whole" aria-hidden="true"><span class="strip">${face}</span></span>`;
      let s = '';
      for (let j = 0; j < 5; j++) s += `<span class="strip" style="--j:${j}">${face}</span>`;
      return `<span class="card" aria-hidden="true">${s}</span>`;
    };
    const tile = (r, k) => {
      const [no, kind, name, p, old, , , turn, icon] = r;
      return `<li style="--i:${k}"${old ? ' data-sale' : ''}><a class="tile" href="item.html?id=${esc(no)}">`
        + card(no, turn, icon, true)
        + `<span class="tile__name"><span class="tile__kind">${esc(kind)}</span> ${esc(name)}</span>`
        + `<span class="tile__price price">${priceHTML(p, old)}</span></a></li>`;
    };
    const id = new URLSearchParams(location.search).get('id');
    const i = id ? items.findIndex((r) => r[0] === id) : -1;
    if (i >= 0) {
      const [no, kind, name, p, old, path, cat, turn, icon] = items[i];
      const f = (k) => $(`[data-f="${k}"]`);
      document.title = `${kind} ${name} · Волчок, прототип`;
      f('kind').textContent = kind;
      f('name').textContent = name;
      f('price').innerHTML = priceHTML(p, old);
      f('buy').href = `${SITE}/shop/${path}/`;
      f('no').textContent = no;
      f('cat').textContent = cats[cat][0];
      f('cat').href = cats[cat][1];
      $('.item__card').innerHTML = card(no, turn, icon);
      let more = items.filter((r, k) => r[2] === name && k !== i);
      let title = `Ещё ${name}`;
      if (!more.length) {
        more = items.filter((r, k) => r[6] === cat && k !== i).slice(0, 6);
        title = `Ещё в разделе «${cats[cat][0]}»`;
      }
      f('more-title').textContent = title;
      f('more').innerHTML = more.map(tile).join('');
      const sec = $('.more-items');
      if (sec) sec.hidden = !more.length;
    }
    root.classList.remove('item-wait');
  }
  root.classList.remove('item-wait');
})();
