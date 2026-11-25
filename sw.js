const publicCache = 'travel-account-shell-v1';
const root = new URL('./', self.registration.scope);
const publicPaths = new Set([
  '', 'index.html', 'trip.html', 'calendar-account.js', 'trip-account.js',
  'calendar-tools.js','calendar-view.js','drawn-draft.js','circle-draft.js','share.html','share-panel.js','shared-view.js',
  'itinerary.js', 'cloud.js', 'config.js', 'migration.js', 'trip-form.js', 'places.json', 'manifest.webmanifest'
]);

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(name => name.startsWith('nytrip-network-') ||
      ['ny-c2101c544a','ny-evening-20261119'].includes(name));
    await Promise.all(old.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(root.href)) return;
  const relative = url.pathname.slice(root.pathname.length);
  if (!publicPaths.has(relative)) return;

  event.respondWith((async () => {
    const cache = await caches.open(publicCache);
    const key = new URL(url.pathname, root).href;
    try {
      const response = await fetch(event.request, {cache:'no-store'});
      if (response.ok) await cache.put(key, response.clone()).catch(() => {});
      return response;
    } catch {
      return await cache.match(key) ||
        new Response('请联网后打开旅行日历。', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
