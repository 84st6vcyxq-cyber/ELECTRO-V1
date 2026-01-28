const CACHE_NAME="maintenance-toolbox-v1-full";
const ASSETS=["./","./index.html","./style.css?v=1.0.1","./app.js?v=1.0.1","./manifest.json","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",(e)=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener("activate",(e)=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE_NAME?null:caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",(e)=>{
  const req=e.request;
  e.respondWith(caches.match(req).then(res=>res||fetch(req).then(net=>{
    const copy=net.clone(); caches.open(CACHE_NAME).then(c=>c.put(req,copy)); return net;
  }).catch(()=>caches.match("./index.html"))));
});
