const VERSION = 'war-maps-v0.12.0';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';
const BASE = new URL('./', self.location.href);
const CORE = ['index.html','about.html','sources.html','install.html','publications.html','offline.html',
  'styles.css','brand.css','atlas-ui.js','pwa.js','information.js','manifest.webmanifest',
  'assets/compass-rose.svg','assets/compass-192.png','assets/compass-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('war-maps-') && ![SHELL,RUNTIME].includes(key)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  if (/\.(pdf|zip)$/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request, {ignoreSearch:true});
    try {
      const response = await fetch(request);
      const bytes = Number(response.headers.get('content-length') || 0);
      // Large datasets, external maps and video are deliberately not downloaded for offline use.
      if (response.ok && bytes > 0 && bytes <= 5*1024*1024) {
        const cache = await caches.open(RUNTIME);
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        await Promise.all(keys.slice(0,Math.max(0,keys.length-80)).map(key => cache.delete(key)));
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match(new URL('offline.html',BASE).href);
      return Response.error();
    }
  })());
});
