const VERSION = 'nytrip-network-20261119-2';
const SCOPE = self.registration.scope;
const INDEX = new URL('index.html', SCOPE).href;
const ASSETS = [
  'manifest.webmanifest', 'icon-180.png', 'icon-512.png',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js',
  'fonts/Caveat-500.woff2', 'fonts/Caveat-600.woff2',
  'fonts/IBMPlexMono-400.woff2', 'fonts/IBMPlexMono-500.woff2',
  'fonts/NotoSerifSC-500.woff2', 'fonts/NotoSerifSC-700.woff2'
];

async function cachePage(cache, response) {
  await cache.put(INDEX, response.clone());
  await cache.put(new URL('./', SCOPE).href, response.clone());
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const index = await fetch(new Request(INDEX, {cache: 'no-store'}));
    if (!index.ok) throw new Error('The latest itinerary could not be downloaded.');
    await cachePage(cache, index);
    await Promise.allSettled(ASSETS.map(async asset => {
      const url = new URL(asset, SCOPE).href;
      const response = await fetch(new Request(url, {cache: 'no-store'}));
      if (response.ok) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const ownedOldCaches = new Set(['ny-c2101c544a', 'ny-evening-20261119']);
    await Promise.all((await caches.keys()).filter(name =>
      ownedOldCaches.has(name) || (name.startsWith('nytrip-network-') && name !== VERSION)
    ).map(name => caches.delete(name)));
    await self.clients.claim();
    // A tab running the old HTML has no update listener. Reload it once when
    // this worker replaces the cache-first worker, preserving its route.
    const windows = await self.clients.matchAll({type: 'window'});
    await Promise.allSettled(windows.filter(client => client.url.startsWith(SCOPE))
      .map(client => client.navigate(client.url)));
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.href.startsWith(SCOPE)) return;
  const isPage = request.mode === 'navigate' || url.pathname === new URL(INDEX).pathname;
  if (isPage) {
    // Always ask the network for the itinerary. HTTP errors and network
    // failures fall back to the last working copy for offline travel.
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const response = await fetch(new Request(request, {cache: 'no-store'}));
        if (!response.ok) throw new Error('Page unavailable');
        try { await cachePage(cache, response); } catch (_) {}
        return response;
      } catch (_) {
        const offline = await cache.match(INDEX);
        return offline || new Response('离线行程暂不可用，请联网后重试。', {
          status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
        });
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const saved = await cache.match(request);
    if (saved) return saved;
    const response = await fetch(request);
    if (response.ok) { try { await cache.put(request, response.clone()); } catch (_) {} }
    return response;
  })());
});
