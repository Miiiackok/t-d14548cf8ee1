const V='ny-23cc29a4b9',A=["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-512.png", "vendor/pdf.min.js", "vendor/pdf.worker.min.js", "fonts/Caveat-500.woff2", "fonts/Caveat-600.woff2", "fonts/IBMPlexMono-400.woff2", "fonts/IBMPlexMono-500.woff2", "fonts/NotoSerifSC-500.woff2", "fonts/NotoSerifSC-700.woff2"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(A)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin) return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||(e.request.mode==='navigate'?caches.match('index.html'):fetch(e.request))));
});
