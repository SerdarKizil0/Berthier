import type {Idea,Review} from './research';
import type {CalendarEvent,EventKind,Profile} from './calendar';
import type {Routine,Session,Skip,Running,ReminderTrial} from './routines';
import type {Kind} from './kinds';
export type FrontType='course'|'lane'|'application'|'general';
// removedAt (5 Ekim, “Kaldır”): the move left the queue but stays on record; the change that set it takes it back.
export type Move={id:string;text:string;userEdited?:boolean;directGoal?:string;prerequisiteReason?:string;doneAt?:string;removedAt?:string;eventId?:string;prepareAt?:string;dependent?:boolean};
export type MovePreference={frontTitle:string;before:string;after:string;at:string};
export type Front={id:string;title:string;type:FrontType;status:'active'|'held'|'closed';moves:Move[];where:string;question:string;notes:string[];touched:string;closedAt?:string;was?:FrontType[]};
export type Slot={frontId:string;moveId:string;text:string;reason:string;doneAt?:string};
export type Order={date:string;slots:Slot[];approvedAt?:string};
export type Op={key:string;before:unknown;after:unknown;undone?:boolean};
// moved: a dictation item moved to another kind (Kayıt defteri › Değiştir); the receipt follows it.
export type Moved={sourceId:string;ref:string;to:Kind;newRef:string;key:string;text:string;note:string};
export type Change={id:string;label:string;at:string;ops:Op[];sourceId?:string;moved?:Moved};
// What the user corrected about kinds and front types; the last 30 go to the model.
export type KindPreference={text:string;from:Kind;to:Kind;at:string};
export type TypePreference={title:string;from:FrontType;to:FrontType|'routine';at:string};
// P5 records (morning report, expedition logbook) live outside the change log: they are Berthier's own notes, not user edits.
export type DaySummary={summary:string;hash:string;at:string;fallback?:boolean};
// Tercihler › Ritim. Absent means the defaults (report 08:30, review Sunday 20:00, quiet 23:00–07:30).
export type Rhythm={report:string;reviewDay:number;reviewTime:string;quietFrom:string;quietTo:string};
export const RHYTHM:Rhythm={report:'08:30',reviewDay:0,reviewTime:'20:00',quietFrom:'23:00',quietTo:'07:30'};
export type State={movePreferences?:MovePreference[];fronts:Record<string,Front>;orders:Record<string,Order>;setup:boolean;changes:Change[];receipts:string[];events?:Record<string,CalendarEvent>;profile?:Profile;prepDefaults?:Partial<Record<EventKind,number>>;seenConflicts?:string[];ideas?:Record<string,Idea>;review?:Review;reviewHistory?:Review[];ideaImports?:string[];conflictCaughtAt?:Record<string,string>;seenWarnings?:Record<string,string>;metrics?:{reportOpenedAt?:Record<string,string>};expedition?:{startedAt:string};logbook?:Record<string,DaySummary>;rhythm?:Rhythm;routines?:Record<string,Routine>;sessions?:Session[];skips?:Skip[];running?:Running|null;reminderTrial?:ReminderTrial|null;kindPreferences?:KindPreference[];typePreferences?:TypePreference[]};
export type Dictation={id:string;raw:string;context:string|null;created_at:string;status:string;result:string|null};
// K7 (4 Ekim): the keys stay; lane is now Proje and general İş.
export const labels={course:'Dersler',lane:'Projeler',application:'Başvurular',general:'İşler'};
export const typeNames:Record<FrontType,string>={course:'Ders',lane:'Proje',application:'Başvuru',general:'İş'};
export const fresh=():State=>({fronts:{},orders:{},setup:false,changes:[],receipts:[]});
export const uid=()=>crypto.randomUUID();
export const normalize=(s:string)=>s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
export const canonicalTitle=(s:string)=>normalize(s).split(' ').filter(w=>!['projesi','proje','başvurusu','başvuru','dersi','ders','araştırması'].includes(w)).join(' ');
export function similarity(a:string,b:string){const x=new Set(normalize(a).split(' ')),y=new Set(normalize(b).split(' '));return [...x].filter(t=>y.has(t)).length/new Set([...x,...y]).size;}
export function dayKey(now=new Date()){return new Date(now.getTime()-3600000).toISOString().slice(0,10);}// Istanbul UTC+3 minus 04:00 day boundary.
// “Olduğu gibi ekle” keeps the text as written; only the move length limit holds (one line, spaces collapsed).
export const MOVE_LIMIT=120,moveText=(text:string)=>text.replace(/\s+/g,' ').trim();
export function validMove(text:string){return text.length<=120&&text.trim().split(/\s+/).length>=2&&!/(?:^|\s)(çalış|ilgilen|hallet|düşün|araştır|bak|gözden geçir|organize et|planla|hazırlan|uğraş)[.!]?$/iu.test(text.trim());}
export function directGoal(f:Front):string|undefined {
 const m=nextMove(f);if(!m||m.eventId||m.userEdited)return;
 if(m.directGoal)return m.directGoal;
 // Old records predate prerequisite metadata: only offer a short, explicit original action.
 return [...f.notes].reverse().find(raw=>raw.length<=120&&!/[\n?!]/.test(raw)&&/\b(yap|al|git|oku|yaz|pişir|gönder|ara|temizle|öde)[.!]?$/iu.test(raw.trim())&&similarity(raw,f.title)>=.2&&normalize(raw)!==normalize(m.text));
}
export const isOpen=(m:Move)=>!m.doneAt&&!m.removedAt;
// A closed front that takes a new move opens again (in the same change, so one undo closes it again).
export function reopen(f:Front){if(f.status==='closed'){f.status='active';delete f.closedAt;}}
const byTurn=(a:Move,b:Move)=>Number(!!b.eventId)-Number(!!a.eventId)||(a.prepareAt??'').localeCompare(b.prepareAt??'')||Number(!!b.dependent)-Number(!!a.dependent);
export const nextMove=(f:Front,date=dayKey())=>f.moves.filter(m=>isOpen(m)&&(!m.prepareAt||m.prepareAt<=date)).sort(byTurn)[0];
// The front's queue in the order Berthier takes it: the open moves due now (the first is nextMove), then the preparations still ahead.
export function openMoves(f:Front,date=dayKey()){const open=f.moves.filter(isOpen),due=open.filter(m=>!m.prepareAt||m.prepareAt<=date).sort(byTurn);return [...due,...open.filter(m=>!due.includes(m)).sort((a,b)=>a.prepareAt!.localeCompare(b.prepareAt!))];}
export function fallbackMove(f:Pick<Front,'title'|'type'>){const t=f.title.slice(0,60);return f.type==='course'?`${t} ders sayfasını aç ve sıradaki konuları listele.`:f.type==='application'?`${t} başvuru sayfasını aç ve istenen belgeleri listele.`:`${t} için mevcut notlarını aç ve yanıtlanacak ilk soruyu yaz.`;}
export function propose(s:State,date=dayKey()):Order{
 const previous=Object.values(s.orders).filter(o=>o.date<date&&o.approvedAt).sort((a,b)=>b.date.localeCompare(a.date))[0];
 const carried=new Set(previous?.slots.filter(x=>s.fronts[x.frontId]?.moves.some(m=>m.id===x.moveId&&!m.doneAt)).map(x=>x.frontId));
 const fronts=Object.values(s.fronts).filter(f=>f.status==='active'&&nextMove(f,date)).sort((a,b)=>Number(!!nextMove(b,date)?.eventId)-Number(!!nextMove(a,date)?.eventId)||(nextMove(a,date)?.prepareAt??'9999').localeCompare(nextMove(b,date)?.prepareAt??'9999')||Number(carried.has(b.id))-Number(carried.has(a.id))||Number(b.type==='application')-Number(a.type==='application')||a.touched.localeCompare(b.touched)||a.title.localeCompare(b.title,'tr'));
 return {date,slots:fronts.map(f=>({frontId:f.id,moveId:nextMove(f,date)!.id,text:nextMove(f,date)!.text,reason:nextMove(f,date)?.eventId?'Tarihli kalemin hazırlık zamanı geldi.':carried.has(f.id)?'Önceki onaylı emirden devreden hamle.':f.type==='application'?'Başvurunun sıradaki açık hamlesi.':f.type==='lane'?'Bu hafta aktif seçtiğin proje.':'Sıradaki açık hamle.'}))};
}
// Rutinler keep one change-log key per record, like front:/order: — a routine (routine:<id>), a session
// (session:<id>), a day put off (skip:<routineId>:<day>), the running timer and the reminder trial — so a
// command copies only what it touched, never the whole session history (the state is one D1 row).
const sessionsById=(s:State)=>new Map((s.sessions??[]).map(x=>[x.id,x]));
const skipKey=(k:Skip)=>'skip:'+k.routineId+':'+k.day,skipsByKey=(s:State)=>new Map((s.skips??[]).map(k=>[skipKey(k),k]));
function value(s:State,key:string,sessions=sessionsById(s),skips=skipsByKey(s)):unknown {if(key==='setup')return s.setup;if(key==='rhythm')return s.rhythm??null;if(key==='running')return s.running??null;if(key==='reminderTrial')return s.reminderTrial??null;if(key.startsWith('routine:'))return s.routines?.[key.slice(8)]??null;if(key.startsWith('session:'))return sessions.get(key.slice(8))??null;if(key.startsWith('skip:'))return skips.get(key)??null;if(key==='learned')return {kindPreferences:s.kindPreferences??[],typePreferences:s.typePreferences??[]};if(key==='preferences')return s.movePreferences??[];if(key==='research')return {ideas:s.ideas??{},review:s.review??null,reviewHistory:s.reviewHistory??[],ideaImports:s.ideaImports??[]};if(key==='calendar')return {events:s.events??{},profile:s.profile??null,prepDefaults:s.prepDefaults??{},seenConflicts:s.seenConflicts??[]};const [kind,id]=key.split(':');return kind==='front'?s.fronts[id]??null:s.orders[id]??null;}
function put(s:State,key:string,v:unknown){if(key==='setup'){s.setup=Boolean(v);return;}if(key==='rhythm'){if(v===null)delete s.rhythm;else s.rhythm=structuredClone(v) as Rhythm;return;}if(key==='learned'){Object.assign(s,structuredClone(v));return;}if(key==='running'){if(v===null)delete s.running;else s.running=structuredClone(v) as Running;return;}if(key==='reminderTrial'){if(v===null)delete s.reminderTrial;else s.reminderTrial=structuredClone(v) as ReminderTrial;return;}if(key.startsWith('routine:')){const id=key.slice(8);s.routines??={};if(v===null)delete s.routines[id];else s.routines[id]=structuredClone(v) as Routine;return;}if(key.startsWith('session:')){const id=key.slice(8),list=s.sessions??[],x=structuredClone(v) as Session|null;s.sessions=x===null?list.filter(y=>y.id!==id):list.some(y=>y.id===id)?list.map(y=>y.id===id?x:y):[...list,x];return;}if(key.startsWith('skip:')){const list=s.skips??[],k=structuredClone(v) as Skip|null;s.skips=k===null?list.filter(y=>skipKey(y)!==key):list.some(y=>skipKey(y)===key)?list.map(y=>skipKey(y)===key?k:y):[...list,k];return;}if(key==='preferences'){s.movePreferences=structuredClone(v) as MovePreference[];return;}if(key==='research'){Object.assign(s,v);return;}if(key==='calendar'){const c=v as Pick<State,'events'|'profile'|'prepDefaults'|'seenConflicts'>;Object.assign(s,c);return;}const [kind,id]=key.split(':');const collection=(kind==='front'?s.fronts:s.orders) as Record<string,unknown>;if(v===null)delete collection[id];else collection[id]=structuredClone(v);}
export function commitChanges(s:State,label:string,mutate:(draft:State)=>void):State {
 const n=structuredClone(s);mutate(n);const routineKeys=(x:State)=>[...Object.keys(x.routines??{}).map(k=>'routine:'+k),...(x.sessions??[]).map(k=>'session:'+k.id),...(x.skips??[]).map(skipKey)];
 const keys=new Set(['setup','calendar','research','preferences','rhythm','learned',...Object.keys(s.fronts).map(k=>'front:'+k),...Object.keys(n.fronts).map(k=>'front:'+k),...Object.keys(s.orders).map(k=>'order:'+k),...Object.keys(n.orders).map(k=>'order:'+k),...routineKeys(s),...routineKeys(n),'running','reminderTrial']);
 const was=sessionsById(s),is=sessionsById(n),wasSkips=skipsByKey(s),isSkips=skipsByKey(n),ops:Op[]=[];for(const key of keys){const before=value(s,key,was,wasSkips),after=value(n,key,is,isSkips);if(JSON.stringify(before)!==JSON.stringify(after))ops.push({key,before:structuredClone(before),after:structuredClone(after)});}
 if(ops.length)n.changes.push({id:uid(),label,at:new Date().toISOString(),ops});return n;
}
export function undo(s:State,changeId:string,index?:number){const n=structuredClone(s),c=n.changes.find(c=>c.id===changeId);if(!c)throw Error('Değişiklik bulunamadı.');const selected=c.ops.filter((o,i)=>!o.undone&&(index===undefined||i===index));if(!selected.length)throw Error('Bu değişiklik zaten geri alındı.');
 if(index!==undefined&&c.ops.some(o=>!o.undone&&(o.key==='calendar'||o.key==='research'||o.key==='preferences'||o.key==='learned'))&&c.ops.length>1)throw Error('Birbirine bağlı kayıtlar birlikte değişti. Tümünü geri al seçeneğini kullan.');
 if(index!==undefined&&c.ops.some(o=>!o.undone&&o.key.startsWith('order:'))&&c.ops.some(o=>!o.undone&&o.key.startsWith('front:')))throw Error('Bu hamle ve emir birlikte değişti. Tutarlılığı korumak için Tümünü geri al seçeneğini kullan.');
 const leaving=(key:string)=>selected.some(o=>o.key===key&&o.before===null);
 for(const op of selected){if(op.key.startsWith('front:')&&op.before===null){const id=op.key.slice(6);if(Object.values(n.ideas??{}).some(i=>i.laneId===id)&&!selected.some(o=>o.key==='research'))throw Error('Bu projeye bağlı depo kayıtları var. Önce onları geri al.');if(Object.values(n.events??{}).some(e=>e.frontId===id)&&!selected.some(o=>o.key==='calendar'))throw Error('Bu cepheye bağlı tarih var. Önce tarih değişikliğini geri al.');const current=n.orders[dayKey()];if(current?.slots.some(x=>x.frontId===id)&&!selected.some(o=>o.key==='order:'+dayKey()&&(!(o.before as Order|null)?.slots.some(x=>x.frontId===id))))throw Error('Bu cepheyi kullanan bir emir var. Önce o emir değişikliğini geri al.');}
 // A routine's records follow it: its creation is not taken back while its sessions, put-off days or timer
 // stay; a session, day or timer comes back only with its routine.
 if(op.key.startsWith('routine:')&&op.before===null){const id=op.key.slice(8);if((n.sessions??[]).some(x=>x.routineId===id&&!leaving('session:'+x.id))||(n.skips??[]).some(k=>k.routineId===id&&!leaving(skipKey(k)))||(n.running?.routineId===id&&!leaving('running')))throw Error('Bu rutine bağlı kayıtlar var. Önce onları geri al.');}
 if((op.key.startsWith('session:')||op.key.startsWith('skip:')||op.key==='running')&&op.before!==null){const id=(op.before as {routineId:string}).routineId;if(!n.routines?.[id]&&!selected.some(o=>o.key==='routine:'+id&&o.before!==null))throw Error('Bu kaydın rutini artık yok. Önce rutinin değişikliğini geri al.');}}
 const byId=sessionsById(n),byKey=skipsByKey(n);for(const op of selected){if(JSON.stringify(value(n,op.key,byId,byKey))!==JSON.stringify(op.after))throw Error('Bu kayıtta daha yeni bir değişiklik var. Önce onun değişikliğini geri al.');}
 for(const op of selected){put(n,op.key,op.before);op.undone=true;}
 // A paused routine never has a running timer (routineStart and routinePause keep this); an undo keeps it too.
 const run=n.running;if(run&&n.routines?.[run.routineId]?.status==='paused'&&selected.some(o=>o.key==='running'||o.key==='routine:'+run.routineId))throw Error('Durdurulan rutinde sayaç süremez. Önce daha yeni değişikliği geri al.');return n;
}
export function ensureOrder(s:State){const d=dayKey();return s.orders[d]??propose(s,d);}
// A passed camp is frozen: a completed move keeps its slot (with doneAt) and the slot never changes again.
export function replaceSlot(s:State,f:Front,done?:Move){const o=s.orders[dayKey()];if(!o)return;const m=nextMove(f);o.slots=o.slots.flatMap(x=>x.frontId!==f.id||x.doneAt?[x]:done?.doneAt?[{...x,moveId:done.id,text:done.text,doneAt:done.doneAt}]:m?[{...x,moveId:m.id,text:m.text}]:[]);}
// The first completion stores an unapproved suggestion as it was (still unapproved), so the passed camp survives.
export function materializeOrder(s:State,frontId:string){const d=dayKey();if(s.orders[d])return;const p=propose(s,d);if(p.slots.some(x=>x.frontId===frontId))s.orders[d]=p;}
// Passed camps stay where they are; only the others take the new relative order.
export function keepPassed(o:Order,ids:string[]){const done=new Set(o.slots.filter(x=>x.doneAt).map(x=>x.frontId)),rest=ids.filter(id=>!done.has(id));return o.slots.map(x=>x.doneAt?x.frontId:rest.shift()!).filter(Boolean).concat(rest);}
