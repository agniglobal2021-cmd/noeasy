/* NOEASY · The Halls · sw.js — keeps the hall's heavy files on the visitor's device between visits.

   Works only for /the-halls/ (the rest of the site never goes through it) and only for files that are
   safe to keep:
     · the-halls/assets/*      textures, fonts, logo — their names carry a hash of the contents, so a
                               changed file always has a new name: served straight from the device;
     · three.js from cdnjs     the address names the exact version: straight from the device;
     · gallery/thumbs/*.webp   the paintings in the hall,
       gallery/images/*, hi/*  the full pictures opened in the panel,
       the-halls/audio/*       the sounds:
                               served from the device at once; in the background a HEAD request
                               checks whether the site has a newer file, and if so it is fetched
                               for the next visit.
   Never kept: the page itself, works.json, sounds.json, door.js, the bot's addresses — they always come
   from the site, so a new version of the hall or a newly hung work is there on the very next load.
   Requests for part of a file (Range, the way <audio> streams) go to the network untouched.

   STOP: open /the-halls/?nosw once and this page unregisters itself and empties its caches. To switch
   it off for everyone, replace this file with one that does the same in 'activate' (self.registration
   .unregister() and caches.delete for every 'halls-' cache): browsers check this file on every visit. */
const KEEP = 'halls-keep-v1';      // files whose address changes when they change
const FRESH = 'halls-fresh-v1';    // files refreshed in the background

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const n of await caches.keys()) if (n.startsWith('halls-') && n !== KEEP && n !== FRESH) await caches.delete(n);
    await self.clients.claim();
  })());
});

function kind(url) {
  if (url.origin === self.location.origin) {
    const p = url.pathname;
    if (p.startsWith('/the-halls/assets/')) return 'keep';
    if (p.startsWith('/the-halls/audio/') && !p.endsWith('.json')) return 'fresh';
    if (p.startsWith('/gallery/thumbs/') && p.endsWith('.webp')) return 'fresh';
    if (p.startsWith('/gallery/images/') || p.startsWith('/gallery/hi/')) return 'fresh';
    return '';
  }
  if (url.hostname === 'cdnjs.cloudflare.com' && /\/three\.js\/r\d+\//.test(url.pathname)) return 'keep';
  return '';
}

async function fromKeep(req) {
  const cache = await caches.open(KEEP);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone()).catch(() => {});
  return res;
}

/* refreshed files: the copy on the device is served at once; meanwhile a HEAD request asks the site
   whether the file changed (its ETag), and only then is the new file downloaded for the next visit.
   A file seen for the first time goes straight to the page and is stored on the side, so a long
   sound still plays while it downloads. */
function fromFresh(req, e) {
  const cacheP = caches.open(FRESH);
  return cacheP.then(cache => cache.match(req).then(hit => {
    if (hit) {
      e.waitUntil(revalidate(req, hit, cache).catch(() => {}));
      return hit;
    }
    return fetch(req).then(res => {
      if (res.ok && res.type === 'basic') e.waitUntil(cache.put(req, res.clone()).catch(() => {}));
      return res;
    });
  }));
}
async function revalidate(req, hit, cache) {
  const head = await fetch(req.url, { method: 'HEAD', cache: 'no-cache' });
  if (!head.ok) return;
  const et = head.headers.get('etag'), lm = head.headers.get('last-modified');
  const changed = et ? et !== hit.headers.get('etag') : (lm && lm !== hit.headers.get('last-modified'));
  if (!changed) return;
  const res = await fetch(req.url, { cache: 'no-cache' });
  if (res.ok) await cache.put(req, res);
}

/* the first visit loads everything before this worker exists; the page then names what it already
   has (textures, previews, three.js), and the worker copies those — mostly straight from the browser's
   own cache — so the second visit is already fast. Sounds are left to be stored on their next load. */
let stopped = false;
self.addEventListener('message', e => {
  if (e.data && e.data.stop) {                 // ?nosw: forget everything and step aside at once
    stopped = true;
    e.waitUntil((async () => {
      for (const n of await caches.keys()) if (n.startsWith('halls-')) await caches.delete(n);
      await self.registration.unregister();
    })());
    return;
  }
  const list = e.data && Array.isArray(e.data.warm) ? e.data.warm : null;
  if (!list) return;
  e.waitUntil((async () => {
    for (const u of list.slice(0, 200)) {
      let url; try { url = new URL(u, self.location.href); } catch (x) { continue; }
      const k = kind(url);
      if (!k || url.pathname.startsWith('/the-halls/audio/')) continue;
      const cache = await caches.open(k === 'keep' ? KEEP : FRESH);
      if (await cache.match(url.href)) continue;
      try {
        const res = await fetch(url.href, url.origin === self.location.origin ? {} : { mode: 'cors' });
        if (res.ok) await cache.put(url.href, res);
      } catch (x) {}
    }
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (stopped || req.method !== 'GET' || req.headers.has('range')) return;
  let url;
  try { url = new URL(req.url); } catch (x) { return; }
  const k = kind(url);
  if (k === 'keep') e.respondWith(fromKeep(req).catch(() => fetch(req)));
  else if (k === 'fresh') e.respondWith(fromFresh(req, e).catch(() => fetch(req)));
});
