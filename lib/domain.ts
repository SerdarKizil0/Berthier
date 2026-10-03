import type {Idea,Review} from './research';
import type {CalendarEvent,EventKind,Profile} from './calendar';
import type {MorningReport,Expedition,NotificationPreferences} from './rhythm';
import {syncCurrentReport} from './rhythm';
export type FrontType='course'|'lane'|'application'|'general';
export type Move={id:string;text:string;userEdited?:boolean;directGoal?:string;prerequisiteReason?:string;doneAt?:string;eventId?:string;prepareAt?:string;dependent?:boolean};
export type MovePreference={frontTitle:string;before:string;after:string;at:string};
export type Front={id:string;title:string;type:FrontType;status:'active'|'held'|'closed';moves:Move[];where:string;question:string;notes:string[];touched:string};
export type Slot={frontId:string;moveId:string;text:string;reason:string;frontTitle?:string;frontType?:FrontType;doneAt?:string};
export type Order={date:string;slots:Slot[];approvedAt?:string};
export type Op={key:string;before:unknown;after:unknown;undone?:boolean};
export type Change={id:string;label:string;at:string;ops:Op[];metricKind?:'manual'|'setting'};
export type State={reports?:Record<string,MorningReport>;expedition?:Expedition;notificationPreferences?:NotificationPreferences;movePreferences?:MovePreference[];fronts:Record<string,Front>;orders:Record<string,Order>;setup:boolean;changes:Change[];receipts:string[];events?:Record<string,CalendarEvent>;profile?:Profile;prepDefaults?:Partial<Record<EventKind,number>>;seenConflicts?:string[];ideas?:Record<string,Idea>;review?:Review;reviewHistory?:Review[];ideaImports?:string[]};
export type Dictation={id:string;raw:string;context:string|null;created_at:string;status:string;result:string|null};
export const labels={course:'Dersler',lane:'Kulvarlar',application:'Başvurular',general:'Genel'};
export const fresh=():State=>({fronts:{},orders:{},setup:false,changes:[],receipts:[]});
export const uid=()=>crypto.randomUUID();
export const normalize=(s:string)=>s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
export const canonicalTitle=(s:string)=>normalize(s).split(' ').filter(w=>!['projesi','proje','başvurusu','başvuru','dersi','ders','araştırması'].includes(w)).join(' ');
export function similarity(a:string,b:string){const x=new Set(normalize(a).split(' ')),y=new Set(normalize(b).split(' '));return [...x].filter(t=>y.has(t)).length/new Set([...x,...y]).size;}
export function dayKey(now=new Date()){return new Date(now.getTime()-3600000).toISOString().slice(0,10);}// Istanbul UTC+3 minus 04:00 day boundary.
export function validMove(text:string){return text.length<=120&&text.trim().split(/\s+/).length>=2&&!/(?:^|\s)(çalış|ilgilen|hallet|düşün|araştır|bak|gözden geçir|organize et|planla|hazırlan|uğraş)[.!]?$/iu.test(text.trim());}
export function directGoal(f:Front):string|undefined {
 const m=nextMove(f);if(!m||m.eventId||m.userEdited)return;
 if(m.directGoal)return m.directGoal;
 // Old records predate prerequisite metadata: only offer a short, explicit original action.
 return [...f.notes].reverse().find(raw=>raw.length<=120&&!/[\n?!]/.test(raw)&&/\b(yap|al|git|oku|yaz|pişir|gönder|ara|temizle|öde)[.!]?$/iu.test(raw.trim())&&similarity(raw,f.title)>=.2&&normalize(raw)!==normalize(m.text));
}
export const nextMove=(f:Front,date=dayKey())=>f.moves.filter(m=>!m.doneAt&&(!m.prepareAt||m.prepareAt<=date)).sort((a,b)=>Number(!!b.eventId)-Number(!!a.eventId)||(a.prepareAt??'').localeCompare(b.prepareAt??'')||Number(!!b.dependent)-Number(!!a.dependent))[0];
export function fallbackMove(f:Pick<Front,'title'|'type'>){const t=f.title.slice(0,60);return f.type==='course'?`${t} ders sayfasını aç ve sıradaki konuları listele.`:f.type==='application'?`${t} başvuru sayfasını aç ve istenen belgeleri listele.`:`${t} için mevcut notlarını aç ve yanıtlanacak ilk soruyu yaz.`;}
export function propose(s:State,date=dayKey()):Order{
 const previous=Object.values(s.orders).filter(o=>o.date<date&&o.approvedAt).sort((a,b)=>b.date.localeCompare(a.date))[0];
 const carried=new Set(previous?.slots.filter(x=>s.fronts[x.frontId]?.moves.some(m=>m.id===x.moveId&&!m.doneAt)).map(x=>x.frontId));
 const fronts=Object.values(s.fronts).filter(f=>f.status==='active'&&nextMove(f,date)).sort((a,b)=>Number(!!nextMove(b,date)?.eventId)-Number(!!nextMove(a,date)?.eventId)||(nextMove(a,date)?.prepareAt??'9999').localeCompare(nextMove(b,date)?.prepareAt??'9999')||Number(carried.has(b.id))-Number(carried.has(a.id))||Number(b.type==='application')-Number(a.type==='application')||a.touched.localeCompare(b.touched)||a.title.localeCompare(b.title,'tr'));
 return {date,slots:fronts.map(f=>({frontId:f.id,frontTitle:f.title,frontType:f.type,moveId:nextMove(f,date)!.id,text:nextMove(f,date)!.text,reason:nextMove(f,date)?.eventId?'Tarihli kalemin hazırlık zamanı geldi.':carried.has(f.id)?'Önceki onaylı emirden devreden hamle.':f.type==='application'?'Başvurunun sıradaki açık hamlesi.':f.type==='lane'?'Bu hafta aktif seçtiğin kulvar.':'Sıradaki açık hamle.'}))};
}
function value(s:State,key:string):unknown {if(key==='setup')return s.setup;if(key==='expedition')return s.expedition??null;if(key==='notifications')return s.notificationPreferences??null;if(key.startsWith('report:'))return s.reports?.[key.slice(7)]??null;if(key==='preferences')return s.movePreferences??[];if(key==='research')return {ideas:s.ideas??{},review:s.review??null,reviewHistory:s.reviewHistory??[],ideaImports:s.ideaImports??[]};if(key==='calendar')return {events:s.events??{},profile:s.profile??null,prepDefaults:s.prepDefaults??{},seenConflicts:s.seenConflicts??[]};const [kind,id]=key.split(':');return kind==='front'?s.fronts[id]??null:s.orders[id]??null;}
function put(s:State,key:string,v:unknown){if(key==='setup'){s.setup=Boolean(v);return;}if(key==='expedition'){if(v===null)delete s.expedition;else s.expedition=structuredClone(v) as Expedition;return;}if(key==='notifications'){if(v===null)delete s.notificationPreferences;else s.notificationPreferences=structuredClone(v) as NotificationPreferences;return;}if(key.startsWith('report:')){s.reports??={};if(v===null)delete s.reports[key.slice(7)];else {const current=s.reports[key.slice(7)];s.reports[key.slice(7)]=structuredClone(v) as MorningReport;if(current){s.reports[key.slice(7)].generatedAt=current.generatedAt;if(current.openedAt)s.reports[key.slice(7)].openedAt=current.openedAt;}}return;}if(key==='preferences'){s.movePreferences=structuredClone(v) as MovePreference[];return;}if(key==='research'){Object.assign(s,v);return;}if(key==='calendar'){const c=v as Pick<State,'events'|'profile'|'prepDefaults'|'seenConflicts'>;Object.assign(s,c);return;}const [kind,id]=key.split(':');const collection=(kind==='front'?s.fronts:s.orders) as Record<string,unknown>;if(v===null)delete collection[id];else collection[id]=structuredClone(v);}
export function commitChanges(s:State,label:string,mutate:(draft:State)=>void,metricKind?:Change['metricKind']):State {
 const n=structuredClone(s);mutate(n);syncCurrentReport(n);const keys=new Set(['setup','calendar','research','preferences','expedition','notifications',...Object.keys(s.reports??{}).map(k=>'report:'+k),...Object.keys(n.reports??{}).map(k=>'report:'+k),...Object.keys(s.fronts).map(k=>'front:'+k),...Object.keys(n.fronts).map(k=>'front:'+k),...Object.keys(s.orders).map(k=>'order:'+k),...Object.keys(n.orders).map(k=>'order:'+k)]);
 const ops:Op[]=[];for(const key of keys){const before=value(s,key),after=value(n,key);if(JSON.stringify(before)!==JSON.stringify(after))ops.push({key,before:structuredClone(before),after:structuredClone(after)});}
 if(ops.length)n.changes.push({id:uid(),label,at:new Date().toISOString(),ops,...(metricKind?{metricKind}:{})});return n;
}
export function undo(s:State,changeId:string,index?:number){const n=structuredClone(s),c=n.changes.find(c=>c.id===changeId);if(!c)throw Error('Değişiklik bulunamadı.');const selected=c.ops.filter((o,i)=>!o.undone&&(index===undefined||i===index));if(!selected.length)throw Error('Bu değişiklik zaten geri alındı.');
 if(index!==undefined&&c.ops.some(o=>!o.undone&&(o.key==='calendar'||o.key==='research'||o.key==='preferences'||o.key==='notifications'||o.key==='expedition'||o.key.startsWith('report:')))&&c.ops.length>1)throw Error('Birbirine bağlı kayıtlar birlikte değişti. Tümünü geri al seçeneğini kullan.');
 if(index!==undefined&&c.ops.some(o=>!o.undone&&o.key.startsWith('order:'))&&c.ops.some(o=>!o.undone&&o.key.startsWith('front:')))throw Error('Bu hamle ve emir birlikte değişti. Tutarlılığı korumak için Tümünü geri al seçeneğini kullan.');
 for(const op of selected){if(op.key.startsWith('front:')&&op.before===null){const id=op.key.slice(6);if(Object.values(n.ideas??{}).some(i=>i.laneId===id)&&!selected.some(o=>o.key==='research'))throw Error('Bu kulvara bağlı depo kayıtları var. Önce onları geri al.');if(Object.values(n.events??{}).some(e=>e.frontId===id)&&!selected.some(o=>o.key==='calendar'))throw Error('Bu cepheye bağlı tarih var. Önce tarih değişikliğini geri al.');const current=n.orders[dayKey()];if(current?.slots.some(x=>x.frontId===id)&&!selected.some(o=>o.key==='order:'+dayKey()&&(!(o.before as Order|null)?.slots.some(x=>x.frontId===id))))throw Error('Bu cepheyi kullanan bir emir var. Önce o emir değişikliğini geri al.');}}
 for(const op of selected){if(!sameJournalValue(op.key,value(n,op.key),op.after))throw Error('Bu kayıtta daha yeni bir değişiklik var. Önce onun değişikliğini geri al.');}
 for(const op of selected){put(n,op.key,op.before);op.undone=true;}return n;
}
export function ensureOrder(s:State){const d=dayKey();return s.orders[d]??propose(s,d);}
export function captureOrder(s:State){const d=dayKey();s.orders[d]??=structuredClone(ensureOrder(s));}
export function replaceSlot(s:State,f:Front){const o=s.orders[dayKey()];if(!o)return;const m=nextMove(f);o.slots=o.slots.flatMap(x=>{if(x.frontId!==f.id||x.doneAt)return [x];const original=f.moves.find(move=>move.id===x.moveId);if(original?.doneAt)return [{...x,frontTitle:x.frontTitle??f.title,frontType:x.frontType??f.type,doneAt:original.doneAt}];return m?[{...x,moveId:m.id,text:m.text}]:[];});}

function sameJournalValue(key:string,a:unknown,b:unknown){if(key.startsWith('report:')){const withoutPreparationMetadata=(v:unknown)=>{if(!v)return v;const copy={...(v as Record<string,unknown>)};delete copy.openedAt;delete copy.generatedAt;return copy;};return JSON.stringify(withoutPreparationMetadata(a))===JSON.stringify(withoutPreparationMetadata(b));}return JSON.stringify(a)===JSON.stringify(b);}

