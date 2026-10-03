import {env} from 'cloudflare:workers';
import {db,read,list,save} from './notebook';
import {dayKey,type State} from './domain';
import {calendarDay,addDays,occurrences,conflicts} from './calendar';
import {staleFronts} from './research';
import {ensureRhythm,preferences,reportSummary} from './rhythm';
import {isQuietTime,localTime,dueWithin,deliveryTtl} from './notification-time';
import {sendWebPush,encode64,validateSubscription,type PushSubscriptionRecord,type VapidConfig} from './web-push';

type SubscriptionRow={id:string;owner:string;endpoint:string;p256dh:string;auth:string};
export type NotificationPayload={title:string;body:string;url:string;kind:'morning'|'review'|'evening'|'conflict'|'test'};
export function vapidConfig():VapidConfig|null{const runtime=env as unknown as Record<string,string|undefined>;const publicKey=runtime.VAPID_PUBLIC_KEY,privateKey=runtime.VAPID_PRIVATE_KEY,subject=runtime.VAPID_SUBJECT;return publicKey&&privateKey&&subject?{publicKey,privateKey,subject}:null;}
export async function subscriptionId(endpoint:string){return encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))));}
export async function notificationStatus(){
 const runtime=env as unknown as Record<string,string|undefined>;
 const row=await db().prepare("SELECT last_started_at,last_completed_at,last_error FROM notification_runtime WHERE id='scheduler'").first<{last_started_at:string;last_completed_at:string|null;last_error:string|null}>();
 const age=row?.last_completed_at?Date.now()-Date.parse(row.last_completed_at):NaN;
 const active=runtime.BERTHIER_SCHEDULER_ENABLED==='true'&&Number.isFinite(age)&&age>=0&&age<3*60000&&!row?.last_error;
 return {configured:!!vapidConfig(),publicKey:vapidConfig()?.publicKey??null,schedulerActive:active,schedulerLastRun:row?.last_completed_at??null};
}
async function deliver(owner:string,sub:SubscriptionRow,dedupe:string,payload:NotificationPayload,state:State,now:Date){
 const p=preferences(state);if(isQuietTime(localTime(now),p))return {accepted:false,suppressed:true};
 const config=vapidConfig();if(!config)return {accepted:false,unconfigured:true};
 const id=crypto.randomUUID(),at=now.toISOString();
 // Each device/day/event claims its own delivery before the network request.
 const claim=await db().prepare('INSERT OR IGNORE INTO notification_deliveries(id,owner,subscription_id,dedupe_key,kind,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,owner,sub.id,dedupe,payload.kind,'sending',at,at).run();
 if(claim.meta.changes!==1)return {accepted:false,duplicate:true};
 const ttl=deliveryTtl(now,p);
 try{
  const result=await sendWebPush({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},{...payload,id,quietStart:p.quietStart,quietEnd:p.quietEnd,expiresAt:new Date(now.getTime()+ttl*1000).toISOString()},config,ttl,now);
  await db().prepare('UPDATE notification_deliveries SET status=?,http_status=?,updated_at=? WHERE id=? AND owner=?').bind(result.accepted?'accepted':'failed',result.status,new Date().toISOString(),id,owner).run();
  if(result.expired)await db().prepare('DELETE FROM push_subscriptions WHERE id=? AND owner=?').bind(sub.id,owner).run();
  return {...result,id};
 }catch{
  // A network timeout may follow acceptance. Do not blindly send a duplicate.
  await db().prepare("UPDATE notification_deliveries SET status='unconfirmed',updated_at=? WHERE id=? AND owner=?").bind(new Date().toISOString(),id,owner).run();
  return {accepted:false,id,unconfirmed:true};
 }
}
async function deliverOwner(owner:string,key:string,payload:NotificationPayload,state:State,now:Date){
 const rows=(await db().prepare('SELECT id,owner,endpoint,p256dh,auth FROM push_subscriptions WHERE owner=?').bind(owner).all<SubscriptionRow>()).results;
 for(const sub of rows)await deliver(owner,sub,key,payload,state,now);
}
export async function sendTestNotification(owner:string,endpoint:string){
 const id=await subscriptionId(endpoint),sub=await db().prepare('SELECT id,owner,endpoint,p256dh,auth FROM push_subscriptions WHERE id=? AND owner=?').bind(id,owner).first<SubscriptionRow>();
 if(!sub)throw Error('Önce bu cihazda bildirim izni ver.');
 const now=new Date(),{state}=await read(owner);
 if(isQuietTime(localTime(now),preferences(state)))throw Error(`Sessiz saatlerde deneme bildirimi de gönderilmez. ${preferences(state).quietEnd}’dan sonra dene.`);
 if(!vapidConfig())throw Error('Bildirim sunucusu henüz bağlanmadı.');
 const recent=await db().prepare("SELECT id FROM notification_deliveries WHERE owner=? AND subscription_id=? AND kind='test' AND created_at>? LIMIT 1").bind(owner,id,new Date(now.getTime()-60000).toISOString()).first();
 if(recent)throw Error('Yeniden denemek için bir dakika bekle.');
 return deliver(owner,sub,'test:'+crypto.randomUUID(),{title:'Berthier burada',body:'Bu cihazda bildirimler çalışıyor. Dokunarak Berthier’e dönebilirsin.',url:'/?view=notifications',kind:'test'},state,now);
}
export async function notifyNewConflicts(owner:string,before:State,after:State,now=new Date()){
 // Quiet-hour conflicts stay in the report; they are never deferred into a later standalone push.
 if(isQuietTime(localTime(now),preferences(after)))return;
 const previous=new Set(conflicts(Object.values(before.events??{}),calendarDay(now)).map(c=>c.id));
 const added=conflicts(Object.values(after.events??{}),calendarDay(now)).filter(c=>!previous.has(c.id));
 if(!added.length)return;
 // A weekly overlap can describe dozens of future occurrences. One edit must
 // produce one calm notification, rather than one alert for every future week.
 const c=added[0],key=await subscriptionId(added.map(c=>c.id).sort().join('\n'));
 await deliverOwner(owner,'conflicts:'+key,{title:'Yeni çakışma',body:`${c.a.date} ${c.a.time} ${c.a.title.slice(0,120)}, ${c.b.title.slice(0,120)} ile çakışıyor.${added.length>1?' Diğer çakışmalar da raporda.':''}`,url:'/?view=report',kind:'conflict'},after,now);
}
export async function runOwnerNotifications(owner:string,now=new Date()){
 let {state,revision}=await read(owner);
 // Fresh read + optimistic save means a timer cannot overwrite a concurrent edit.
 // Before 08:00 a user may request an early report on opening the app, but the
 // unattended scheduler must wait until the promised report preparation time.
 const prepared=localTime(now)>='08:00'?ensureRhythm(state,await list(owner),now):state;
 if(prepared!==state){await save(owner,prepared,revision);state=prepared;revision++;}
 const p=preferences(state),time=localTime(now);if(isQuietTime(time,p)||!vapidConfig())return;
 const date=calendarDay(now),report=state.reports?.[dayKey(now)];
 if(report&&dueWithin(time,p.morningTime))await deliverOwner(owner,'morning:'+date,{title:'Sabah raporu hazır',body:reportSummary(report),url:'/?view=report',kind:'morning'},state,now);
 if(new Date(date+'T12:00:00Z').getUTCDay()===p.weeklyDay&&dueWithin(time,p.weeklyTime)){
  const stale=staleFronts(state,now.getTime()).length;
  await deliverOwner(owner,'review:'+date,{title:'Haftalık teftiş zamanı',body:stale?`Bir haftadır dokunulmamış ${stale} cephe var.`:'Teftiş beş adımdır; kaldığın adım korunur.',url:'/?view=review',kind:'review'},state,now);
 }
 if(dueWithin(time,p.eveningTime)){
  const tomorrow=addDays(date,1),places=occurrences(Object.values(state.events??{}),tomorrow,tomorrow).filter(e=>!!e.location.trim());
  if(places.length){const first=places[0],bring=[...new Set(places.flatMap(e=>e.bring))];await deliverOwner(owner,'evening:'+date,{title:`Yarın${first.time?' '+first.time:''} · ${first.location}`,body:bring.length?`Yanına al: ${bring.join(', ').slice(0,500)}.`:`${first.title}${places.length>1?` ve ${places.length-1} yer daha`:''}.`,url:'/?view=horizon',kind:'evening'},state,now);}
 }
}
/** Call only from a registered server scheduler, never from a browser interval. */
export async function runScheduledNotifications(now=new Date()){
 const started=now.toISOString();await db().prepare("INSERT INTO notification_runtime(id,last_started_at,last_error) VALUES('scheduler',?,NULL) ON CONFLICT(id) DO UPDATE SET last_started_at=excluded.last_started_at,last_error=NULL").bind(started).run();
 let cursor='',failures=0;
 while(true){const owners=(await db().prepare('SELECT owner FROM notebooks WHERE owner>? ORDER BY owner LIMIT 100').bind(cursor).all<{owner:string}>()).results;if(!owners.length)break;
  for(const {owner} of owners){try{await runOwnerNotifications(owner,now);}catch{failures++;}cursor=owner;}
 }
 await db().prepare("UPDATE notification_runtime SET last_completed_at=?,last_error=? WHERE id='scheduler'").bind(new Date().toISOString(),failures?`${failures} kullanıcı güncellenemedi`:null).run();
 if(failures)throw Error('Bazı zamanlanmış bildirimler işlenemedi.');
}
export async function registerSubscription(owner:string,sub:PushSubscriptionRecord){
 await validateSubscription(sub);
 const id=await subscriptionId(sub.endpoint),at=new Date().toISOString();
 const result=await db().prepare('INSERT INTO push_subscriptions(id,owner,endpoint,p256dh,auth,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,updated_at=excluded.updated_at WHERE push_subscriptions.owner=excluded.owner').bind(id,owner,sub.endpoint,sub.keys.p256dh,sub.keys.auth,at,at).run();
 if(result.meta.changes!==1)throw Error('Bu cihazdaki bildirim aboneliği başka bir oturuma bağlı. Tarayıcı ayarlarından izni kaldırıp yeniden izin ver.');
 return id;
}
