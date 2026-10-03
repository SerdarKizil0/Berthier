'use client';
import {useCallback,useEffect,useState} from 'react';
import {Check,Bell,Smartphone,Send} from 'lucide-react';
import type {State} from '@/lib/domain';
import {preferences,type NotificationPreferences} from '@/lib/rhythm';
import {isQuietTime} from '@/lib/notification-time';
type Status={configured:boolean;publicKey:string|null;schedulerActive:boolean;schedulerLastRun:string|null};
type Device={subscribed:boolean;test?:{id:string;status:string;created_at:string;received_at:string|null}|null};
const hhmm=(s:string)=>new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
async function request<T=Record<string,unknown>>(body?:unknown):Promise<T>{const response=await fetch('/api/notifications',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const result=await response.json() as T&{error?:string};if(!response.ok)throw Error(result.error??'Bildirim işlemi tamamlanamadı.');return result;}
function applicationKey(value:string){const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
export function NotificationSettings({state,disabled=false,onPreferences}:{state:State;disabled?:boolean;onBack:()=>void;onPreferences:(value:NotificationPreferences)=>Promise<unknown>|void}){
 const prefs=preferences(state);
 const [status,setStatus]=useState<Status|null>(null),[device,setDevice]=useState<Device>({subscribed:false}),[permission,setPermission]=useState<NotificationPermission>('default'),[standalone,setStandalone]=useState(false),[ios,setIos]=useState(false),[supported,setSupported]=useState(false),[working,setWorking]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[pollUntil,setPollUntil]=useState(0);
 const syncDevice=useCallback(async()=>{const registration=await navigator.serviceWorker.getRegistration('/');const sub=await registration?.pushManager.getSubscription();if(sub)setDevice(await request<Device>({action:'device',endpoint:sub.endpoint}));else setDevice({subscribed:false});},[]);
 useEffect(()=>{
  const iphone=/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
  setIos(iphone);setStandalone(matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true);
  const available='Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator;setSupported(available);if(available){setPermission(Notification.permission);navigator.serviceWorker.register('/sw.js').then(syncDevice).catch(()=>{});}
  request<Status>().then(setStatus).catch(e=>setError(e.message));
  const received=(event:MessageEvent)=>{if(event.data?.type==='PUSH_RECEIVED'&&event.data.kind==='test'){setMessage('Deneme bildirimi bu cihazda gösterildi.');setPollUntil(Date.now()+10000);syncDevice().catch(()=>{});}};
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',received);
  return()=>{if('serviceWorker' in navigator)navigator.serviceWorker.removeEventListener('message',received);};
 },[syncDevice]);
 useEffect(()=>{if(!pollUntil)return;const timer=setInterval(()=>{if(Date.now()>pollUntil){setPollUntil(0);return;}syncDevice().catch(()=>{});},3000);return()=>clearInterval(timer);},[pollUntil,syncDevice]);
 const enable=async()=>{
  if(!status?.publicKey||!supported)return;
  setWorking(true);setError('');setMessage('');
  // Permission is requested in the click handler, before any network/registration await.
  const permissionPromise=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
  try{const allowed=await permissionPromise;setPermission(allowed);if(allowed!=='granted'){setMessage(allowed==='denied'?'İzin kapalı. Cihaz ayarlarında Berthier bildirimlerini açabilirsin.':'İzin vermeden bildirim gönderilmez.');return;}
   const registration=await navigator.serviceWorker.ready;
   let existing=await registration.pushManager.getSubscription();
   const expected=applicationKey(status.publicKey),old=existing?.options.applicationServerKey;
   if(existing&&old&&(old.byteLength!==expected.length||new Uint8Array(old).some((byte,i)=>byte!==expected[i]))){await request({action:'unsubscribe',endpoint:existing.endpoint});await existing.unsubscribe();existing=null;}
   const subscription=existing??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(status.publicKey)});
   const json=subscription.toJSON();await request({action:'subscribe',subscription:{endpoint:subscription.endpoint,keys:json.keys}});await syncDevice();setMessage('Bu cihaz için bildirim izni kaydedildi.');
  }catch(e){setError(e instanceof Error?e.message:'Bildirim kurulumu tamamlanamadı.');}finally{setWorking(false);}
 };
 const test=async()=>{setWorking(true);setError('');setMessage('');try{const registration=await navigator.serviceWorker.ready,sub=await registration.pushManager.getSubscription();if(!sub)throw Error('Önce bildirim izni ver.');const result=await request({action:'test',endpoint:sub.endpoint});setMessage(result.accepted?'Deneme gönderildi. Bu cihazda görüntülenmesi bekleniyor.':'Gönderim doğrulanamadı.');setPollUntil(Date.now()+90000);await syncDevice();}catch(e){setError(e instanceof Error?e.message:'Deneme gönderilemedi.');}finally{setWorking(false);}};
 const disable=async()=>{setWorking(true);setError('');try{const registration=await navigator.serviceWorker.ready,sub=await registration.pushManager.getSubscription();if(sub){await request({action:'unsubscribe',endpoint:sub.endpoint});await sub.unsubscribe();}setDevice({subscribed:false});setMessage('Bu cihazda bildirimler kapatıldı. Yeniden izin vererek açabilirsin.');}catch(e){setError(e instanceof Error?e.message:'Bildirimler kapatılamadı.');}finally{setWorking(false);}};
 const blocked=working||disabled;
 const quietEvening=isQuietTime(prefs.eveningTime,prefs);
 return <div className="notification-settings">
  <p className="eyebrow">KURULUM · {ios?'IPHONE':'BU CİHAZ'}</p>
  <div className="notification-setup">
   <section className="notification-step"><span className="notification-number">{standalone?<Check size={17}/>:1}</span><div><h2><Smartphone size={18}/> Ana ekrana ekle</h2><p>iPhone’da bildirimler yalnız ana ekrandan açılan Berthier’de çalışır. Safari’de Paylaş, sonra Ana Ekrana Ekle.</p></div><span className="eyebrow">{standalone?'TAMAM':ios?'BEKLİYOR':'İPHONE İÇİN'}</span></section>
   <section className="notification-step"><span className="notification-number">{device.subscribed?<Check size={17}/>:2}</span><div><h2><Bell size={18}/> Bildirim izni</h2><p>İzin penceresi yalnız bu düğmeye dokununca açılır.</p>{!device.subscribed&&<button onClick={enable} disabled={blocked||!supported||!status?.configured||(ios&&!standalone)||permission==='denied'}>{permission==='granted'?'Bu cihazı bağla':'İzin ver'}</button>}{permission==='denied'&&<p className="notification-warning">İzin kapalı. Cihaz ayarlarında Berthier bildirimlerini aç.</p>}</div><span className="eyebrow">{device.subscribed?'VERİLDİ':''}</span></section>
   <section className="notification-step"><span className="notification-number">{device.test?.received_at?<Check size={17}/>:3}</span><div><h2><Send size={18}/> Deneme bildirimi</h2><p>Kurulumun bu telefonda çalıştığını görmek için.</p><button onClick={test} disabled={blocked||!device.subscribed||!status?.configured}>Gönder</button>{device.test&&!device.test.received_at&&<p className="muted">{device.test.status==='accepted'?`${hhmm(device.test.created_at)}’de gönderildi; cihazda gösterilmesi henüz doğrulanmadı.`:'Son denemenin teslimi doğrulanamadı.'}</p>}</div><span className="eyebrow">{device.test?.received_at?`${hhmm(device.test.received_at)}’DE GÖSTERİLDİ`:''}</span></section>
  </div>
  {!supported&&<p className="notification-warning">Bu tarayıcıda bildirim desteği yok. iPhone’da Berthier’i ana ekrandan aç.</p>}
  {status&&!status.configured&&<p className="notification-warning">Bildirim sunucusunun kurulumu henüz tamamlanmadı. İzin ve deneme, bağlantı hazır olduğunda açılacak.</p>}
  {status&&!status.schedulerActive&&<p className="notification-warning">Zamanlanmış gönderim henüz doğrulanmadı. Aşağıdaki saatlerde otomatik bildirim geleceği doğrulanmış değil; son rapor uygulamayı açınca hazırlanır.</p>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="notification-warning">{error}</p>}
  <p className="eyebrow">NE ZAMAN GELİR</p>
  <section className="notification-schedule"><header><h2>Sabah raporu</h2><span>Her gün {prefs.morningTime}</span></header><p>{status?.schedulerActive?'Rapor 08:00’de hazırlanır; bildirim seçtiğin saatte gelir.':'Zamanlanmış gönderim etkinleştiğinde rapor 08:00’de hazırlanır; bildirim seçtiğin saatte gönderilir.'}</p><label>Bildirim saati <input type="time" step="900" min="08:00" value={prefs.morningTime} disabled={blocked} onChange={e=>{if(e.target.value)onPreferences({...prefs,morningTime:e.target.value});}}/></label><div className="notification-example"><b>Sabah raporu hazır</b><p>Önerilen emir, uyarılar, olunacak yerler ve kararını bekleyen konular.</p></div></section>
  <section className="notification-schedule"><header><h2>Haftalık teftiş</h2><span>Pazar {prefs.weeklyTime}</span></header><p>Teftiş beş adımdır; kaldığın adım korunur.</p><div className="notification-example"><b>Haftalık teftiş zamanı</b><p>Bir haftadır dokunulmamış cepheler varsa haber verir.</p></div></section>
  <section className="notification-schedule"><header><h2>Çakışma</h2><span>Yakalandığı anda</span></header><p>Sessiz saatlerde yakalanırsa ayrı bildirim olmaz; sabah raporuna girer.</p><div className="notification-example"><b>Yeni çakışma</b><p>Aynı saate gelen iki yer olduğunda haber verir.</p></div></section>
  <section className="notification-schedule"><header><h2>Akşam</h2><span>{prefs.eveningTime}</span></header><p>Yalnız yarın olunacak bir yer varsa gelir. Saatini sen seçersin.</p><label>Akşam saati <input type="time" step="900" value={prefs.eveningTime} disabled={blocked} onChange={e=>{if(e.target.value)onPreferences({...prefs,eveningTime:e.target.value});}}/></label>{quietEvening&&<p className="notification-warning">Bu saat sessiz saatlere denk geliyor; bildirim gelmez. 23:00’ten önce bir saat seç.</p>}<div className="notification-example"><b>Yarınki yerin ve saatin</b><p>Yanına alacaklarını da hatırlatır.</p></div></section>
  <section className="notification-schedule"><header><h2>Sessiz saatler</h2><span>{prefs.quietStart}–{prefs.quietEnd}</span></header><p>Bu aralıkta hiçbir bildirim gelmez.</p></section>
  {device.subscribed&&<button className="text-button" disabled={blocked} onClick={disable}>Bu cihazda bildirimleri kapat</button>}
 </div>;
}
export default NotificationSettings;
