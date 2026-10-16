// FitPulse service worker v3: funciona sin conexión y no rompe peticiones a Firebase/APIs
const CACHE='fitpulse-v3';
const CORE=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-512-maskable.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  // Solo GET del propio sitio. Firebase, Open Food Facts, POST, etc. van directos a la red.
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  e.respondWith(
    fetch(req).then(r=>{
      if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{})}
      return r;
    }).catch(()=>caches.match(req).then(m=>m||(req.mode==='navigate'?caches.match('./index.html'):undefined)))
  );
});
