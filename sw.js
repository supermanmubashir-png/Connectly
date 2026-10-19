'use strict';
// Bump VERSION on every release so old caches are removed.
const VERSION = 'connectly-v1.1.0';
const SHELL = ['./', './index.html', './manifest.json'];
const PEER = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    try { const r = await fetch(PEER); if (r.ok) await c.put(PEER, r); } catch (_) { /* library is cached on first online load instead */ }
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
  // The pinned PeerJS library: cache-first (it is versioned and immutable).
  if (req.url === PEER) {
    e.respondWith(caches.match(PEER).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(PEER, copy)); }
      return r;
    })));
    return;
  }
  // Only same-origin app-shell files are handled. Everything else (signaling
  // WebSockets, other origins, blob: and data: URLs) is never touched or cached.
  if (url.origin !== location.origin) return;
  const isShell = req.mode === 'navigate' || SHELL.some(p => new URL(p, location).pathname === url.pathname);
  if (!isShell) return;
  e.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok && !url.search) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req.mode === 'navigate' ? './index.html' : req, copy)); }
      return r;
    } catch (_) {
      return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html')) || Response.error();
    }
  })());
});
