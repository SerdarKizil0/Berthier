const CACHE='berthier-shell-p5-v4';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type!=='CACHE_SHELL'||!Array.isArray(event.data.assets))return;event.waitUntil((async()=>{const cache=await caches.open(CACHE);const assets=['/',...event.data.assets].filter(value=>{try{const u=new URL(value,self.location.origin);return u.origin===self.location.origin&&(u.pathname==='/'||/\.(js|css|png|svg|woff2)$/.test(u.pathname))&&!u.pathname.startsWith('/api/');}catch{return false;}});await Promise.allSettled([...new Set(assets)].map(async url=>{const r=await fetch(url);if(r.ok&&!r.redirected)await cache.put(url,r);}));})());});
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||/signin|signout|callback/.test(url.pathname))return;
 if(req.mode==='navigate'){event.respondWith(fetch(req).then(async response=>{if(response.ok&&!response.redirected){const cache=await caches.open(CACHE);await cache.put('/',response.clone());}return response;}).catch(async()=>await caches.match('/')||new Response('Berthier’i ilk kez açmak için internete bağlan.',{headers:{'Content-Type':'text/plain;charset=utf-8'}})));return;}
 if(/\.(js|css|png|svg|woff2)$/.test(url.pathname)&&!url.pathname.includes('@'))event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(async response=>{if(response.ok){const cache=await caches.open(CACHE);await cache.put(req,response.clone());}return response;})));
});

// Push payloads are encrypted by the sender. Only same-origin destinations open.
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload;try{payload=event.data?.json();}catch{return;}
  if(!payload||typeof payload.title!=='string'||typeof payload.body!=='string'||typeof payload.id!=='string')return;
  const now=new Date(),time=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
  const start=payload.quietStart||'23:00',end=payload.quietEnd||'07:30';
  const expiresAt=Date.parse(payload.expiresAt);
  if((start>end?(time>=start||time<end):(time>=start&&time<end))||!Number.isFinite(expiresAt)||expiresAt<=now.getTime())return;
  let url='/';try{const destination=new URL(payload.url,self.location.origin);if(destination.origin===self.location.origin)url=destination.pathname+destination.search+destination.hash;}catch{}
  await self.registration.showNotification(payload.title,{body:payload.body,icon:'/icon-192.png',badge:'/icon-192.png',tag:payload.id,data:{id:payload.id,url,kind:payload.kind},renotify:false});
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const window of windows)window.postMessage({type:'PUSH_RECEIVED',id:payload.id,kind:payload.kind,at:now.toISOString()});
  // A successful showNotification call is a device receipt; provider acceptance alone is not.
  try{await fetch('/api/notifications',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'received',id:payload.id})});}catch{}
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  let url=self.location.origin+'/';try{const candidate=new URL(event.notification.data?.url||'/',self.location.origin);if(candidate.origin===self.location.origin)url=candidate.href;}catch{}
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const window of windows){if(new URL(window.url).origin===self.location.origin){await window.navigate(url);await window.focus();return;}}
  await self.clients.openWindow(url);
 })());
});
