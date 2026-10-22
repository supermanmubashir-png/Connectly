'use strict';
// Bump VERSION on every release so old caches are removed.
const VERSION = 'syncbee-v1.4.0';
const SHELL = ['./', './index.html', './home.html', './help.html', './manifest.json'];
const OPTIONAL = ['./icon.png']; // supplied by you; a missing file must not break install
const PEER = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    for (const u of OPTIONAL) { try { await c.add(u); } catch (_) { /* icon.png not present yet */ } }
    try { const r = await fetch(PEER); if (r.ok) await c.put(PEER, r); } catch (_) { /* cached on first online load instead */ }
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.url === PEER) { // pinned, versioned library: cache-first
    e.respondWith(caches.match(PEER).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(PEER, copy)); }
      return r;
    })));
    return;
  }
  // Only same-origin app-shell files are handled. Signaling, other origins, blob: and data: URLs
  // are never touched, and chats, invitations and files are never cached.
  if (url.origin !== location.origin) return;
  const known = [...SHELL, ...OPTIONAL].some(p => new URL(p, location).pathname === url.pathname);
  if (req.mode !== 'navigate' && !known) return;
  e.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok && !url.search) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return r;
    } catch (_) {
      return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./home.html')) || Response.error();
    }
  })());
});
