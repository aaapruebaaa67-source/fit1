// FitPulse service worker v4: sin conexión + recordatorios de agua y entreno
const CACHE='fitpulse-v4';
const CORE=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-512-maskable.png','./icon-agua.png','./icon-entreno.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!=='fitpulse-remind').map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  // Solo GET del propio sitio. Firebase, Open Food Facts, Axón, POST... van directos a la red.
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  if(req.url.includes('__fp_remind'))return;
  e.respondWith(
    fetch(req).then(r=>{
      if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{})}
      return r;
    }).catch(()=>caches.match(req,{ignoreSearch:req.mode==='navigate'}).then(m=>m||(req.mode==='navigate'?caches.match('./index.html'):undefined)))
  );
});

/* ---------- Recordatorios ---------- */
const RKEY='./__fp_remind.json',SKEY='./__fp_shown.json';
const rd=async k=>{try{const c=await caches.open('fitpulse-remind');const r=await c.match(k);return r?await r.json():null}catch(e){return null}};
const wr=async(k,v)=>{try{const c=await caches.open('fitpulse-remind');await c.put(k,new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}}))}catch(e){}};
const localDate=d=>new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
let busy=false;
async function checkReminders(){
  if(busy)return;busy=true;
  try{
    const d=await rd(RKEY);if(!d||!d.on)return;
    const now=new Date(),today=localDate(now),h=now.getHours()+now.getMinutes()/60;
    if(h<8||h>=22)return;                                  // nunca de noche
    const fresh=d.date===today;                            // ¿la app ha guardado datos hoy?
    const train=fresh?d.train:now.getDay()!==d.restDow;
    const trainDone=fresh?d.trainDone:false;
    const pct=fresh?d.waterPct:0;
    let sh=await rd(SKEY);if(!sh||sh.date!==today)sh={date:today,k:{}};
    let n=null;
    if(train&&!trainDone&&typeof d.trainH==='number'&&h>=d.trainH&&h<d.trainH+4&&!sh.k.t){
      n={k:'t',title:'💪 Hoy toca entrenar',body:(d.routine||'Tu rutina')+' te espera. Aunque sean 20 minutos, cuenta.',go:'entreno',icon:'icon-entreno.png'};
    }else{
      for(const wh of (d.waterH||[])){
        const k='w'+wh;
        if(h>=wh&&h<wh+3&&!sh.k[k]){
          const expected=Math.min(1,(wh-7)/14);           // lo razonable a esa hora
          if(pct<expected*0.85){
            n={k,title:'💧 ¿Un vaso de agua?',body:fresh&&d.waterT?'Llevas '+String(d.waterL).replace('.',',')+' de '+String(d.waterT).replace('.',',')+' L. Un toque y lo apunto.':'Un vaso ahora y vas genial. Toca para apuntarlo.',go:'agua',icon:'icon-agua.png'};
          }else sh.k[k]=1;                                 // ya va bien: no molestar
          break;
        }
      }
    }
    if(n){
      sh.k[n.k]=1;await wr(SKEY,sh);
      await self.registration.showNotification(n.title,{body:n.body,icon:n.icon,badge:'icon-192.png',tag:'fp-'+n.k,lang:'es',data:{go:n.go},
        actions:n.go==='agua'?[{action:'agua',title:'+1 vaso'}]:[{action:'entreno',title:'Abrir rutina'}]});
    }else await wr(SKEY,sh);
  }finally{busy=false}
}
self.addEventListener('message',e=>{if(e.data&&e.data.type==='fp-check')e.waitUntil?e.waitUntil(checkReminders()):checkReminders()});
self.addEventListener('periodicsync',e=>{if(e.tag==='fp-remind')e.waitUntil(checkReminders())});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const go=e.action||(e.notification.data&&e.notification.data.go)||'';
  const url=new URL('./index.html'+(go?'?go='+go:''),self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const c=list.find(x=>x.url.startsWith(self.registration.scope));
    if(c){c.postMessage({type:'fp-go',go});return c.focus()}
    return self.clients.openWindow(url);
  }));
});
