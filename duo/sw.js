// Offline support for «Моргот и Рыцарь»: the page itself network-first (new versions arrive when online),
// models (versioned ?v=…) and the three.js library cache-first.
const CN='duo-cache';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
const noQ=u=>{const x=new URL(u);x.search='';x.hash='';return x.href};
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(CN).then(c=>c.put(noQ(r.url),cp))}return res}).catch(async()=>{
      const c=await caches.open(CN),sc=self.registration.scope;
      return (await c.match(noQ(r.url)))||(await c.match(sc))||(await c.match(sc+'index.html'))||new Response('Нет сети, а игра ещё не сохранена для офлайна. Открой её один раз с интернетом.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}));
    return}
  const same=u.origin===location.origin,cdn=u.hostname==='cdn.jsdelivr.net';if(!same&&!cdn)return;
  e.respondWith(caches.open(CN).then(async c=>{const hit=await c.match(r.url);if(hit)return hit;
    try{const res=await fetch(r);if(res.ok&&(cdn||/\.(glb|png|webmanifest)$/.test(u.pathname)))c.put(r.url,res.clone());return res}
    catch(err){const any=await c.match(r.url,{ignoreSearch:true});if(any)return any;throw err}}))});
