import {addIdeas,researchAct,type ResearchCommand} from './research';
import {addDays,calendarDay,resolveDate,syncPlans,type CalendarEvent,type Profile,type EventKind,validDate,validTime} from './calendar';
import {type State,type Front,type Order,type Move,type Moved,type Rhythm,uid,nextMove,openMoves,isOpen,reopen,MOVE_LIMIT,moveText,normalize,canonicalTitle,similarity,fallbackMove,commitChanges,undo,dayKey,propose,replaceSlot,materializeOrder,validMove,directGoal} from './domain';
import type {Parsed} from './llm';
import {ROUTINE_KINDS,addSession,at,findRoutine,newRoutine,pastDay,routineAct,routineLabel,skipDay,stepsOf,usualMinutes,type RoutineCommand} from './routines';
import {rekind,retype} from './kinds';
import {withName} from './turkish';
export function applyParsed(s:State,p:Parsed,raw:string,today=calendarDay(),sourceId:string|null=null):State{
 // The change remembers its dictation, so the answer to a question can be taken back from the morning report.
 const result=commitChanges(s,p.summary||'Dikte işlendi',n=>{
 for(const item of p.items){
 let f=item.id?n.fronts[item.id]:Object.values(n.fronts).find(f=>normalize(f.title)===normalize(item.title)||(f.type===item.type&&canonicalTitle(f.title)===canonicalTitle(item.title))||similarity(f.title,item.title)>=.6);
 if(!f){f={id:uid(),title:item.title,type:item.type,status:item.type==='lane'?'held':'active',moves:[],where:'',question:'',notes:[],touched:new Date().toISOString()};n.fronts[f.id]=f;}
 let done:Move|undefined;if(item.complete){const m=item.completedMoveId?f.moves.find(m=>m.id===item.completedMoveId):nextMove(f);if(m){materializeOrder(n,f.id);m.doneAt=new Date().toISOString();done=m;}}
 if(item.where!==null)f.where=item.where;if(item.question!==null)f.question=item.question;
 // A closed front (an İş closed by Bitti) that is spoken of again with a new move opens again; a project stays the user's call.
 if(item.moves.length){const existing=new Set(f.moves.filter(isOpen).map(m=>normalize(m.text)));let added=false;for(const text of item.moves)if(!existing.has(normalize(text))){f.moves.push({id:uid(),text,...(text===item.moves[0]&&item.prerequisite?{directGoal:item.prerequisite.goal,prerequisiteReason:item.prerequisite.reason}:{})});existing.add(normalize(text));added=true;}if(added&&f.type!=='lane')reopen(f);}
 if(!f.moves.length&&!(p.events??[]).some(e=>e.frontTitle===f!.title&&resolveDate(e.dateText,today)))f.moves.push({id:uid(),text:fallbackMove(f)});
 f.notes.push(raw);f.touched=new Date().toISOString();if(item.complete)replaceSlot(n,f,done);
 }
 n.events??={};
 for(const entry of p.events??[]){const linked=entry.frontTitle?Object.values(n.fronts).find(f=>canonicalTitle(f.title)===canonicalTitle(entry.frontTitle!)):null;const old:CalendarEvent|undefined=entry.id?n.events[entry.id]:Object.values(n.events).find(e=>normalize(e.title)===normalize(entry.title));const id=old?.id??uid();n.events[id]={id,title:entry.title,kind:entry.kind,frontId:linked?.id??old?.frontId??null,date:resolveDate(entry.dateText,today),time:entry.time,endTime:entry.endTime,location:entry.location,bring:entry.bring,weekly:entry.weekly,prepDays:entry.prepDays,documents:entry.documents,institution:entry.institution,program:entry.program,portal:entry.portal};}
 addIdeas(n,p.ideas??[],sourceId);
 for(const change of p.laneUpdates??[]){const lane=change.id?n.fronts[change.id]:Object.values(n.fronts).find(f=>f.type==='lane'&&canonicalTitle(f.title)===canonicalTitle(change.title));if(!lane||lane.type!=='lane')throw Error('Proje bulunamadı.');lane.status=change.status;lane.touched=new Date().toISOString();}
 if(p.prepDefaults?.length){n.prepDefaults??={};for(const d of p.prepDefaults)n.prepDefaults[d.kind]=d.days;}
 if(p.events?.length||p.prepDefaults?.length)syncPlans(n,today);
 // Rutinler: a new routine starts observing (haftada 1 when no number was said); a known one takes a number only if said.
 // A session said done is written, one put off slides like “Bugün değil”; one only pointed at (“yüz yogası yap”) changes nothing.
 const now=new Date(),day=dayKey(now);
 for(const x of p.routines??[]){const known=x.id?n.routines?.[x.id]:findRoutine(n,x.title);const estimate={...(x.minutes?{minutes:x.minutes}:{}),...(x.time?{time:x.time}:{})};
 if(known){if(x.count)known.count=x.count;if(x.travel)known.travel=x.travel;if(Object.keys(estimate).length)known.estimate={...known.estimate,...estimate};if(x.ownWords&&sourceId)known.ownWords={text:x.ownWords,show:true,sourceId};continue;}
 const r=newRoutine(x.title,x.count??1,now,{...(Object.keys(estimate).length?{estimate}:{}),...(x.travel?{travel:x.travel}:{}),...(x.ownWords&&sourceId?{ownWords:{text:x.ownWords,show:true,sourceId}}:{}),...(x.steps?.length?{steps:stepsOf(x.steps)}:{})});(n.routines??={})[r.id]=r;}
 for(const x of p.sessions??[]){if(!x.done&&!x.skip)continue;const r=x.routineId?n.routines?.[x.routineId]:findRoutine(n,x.title);if(!r||r.status==='paused')continue;const when=pastDay(x.dayText,day);if(when<addDays(day,-7))continue;
 if(x.skip){if(!(n.skips??[]).some(k=>k.routineId===r.id&&k.day===when))skipDay(n,r,when,now);continue;}
 const minutes=x.minutes??usualMinutes(n,r)??30,end=x.end?at(when,x.end).toISOString():when===day?now.toISOString():new Date(at(when,r.pattern?.time??r.estimate?.time??'12:00').getTime()+minutes*60000).toISOString();
 addSession(n,{routineId:r.id,day:when,end,minutes,source:'dictation'});}
 });
 if(sourceId&&result.changes.length>s.changes.length)result.changes.at(-1)!.sourceId=sourceId;return result;
}
export type Command=ResearchCommand & RoutineCommand & {moveId?:string;today?:boolean;sourceId?:string;ref?:string;to?:string;count?:number;type?:string;id:string;kind:string;frontId?:string;text?:string;status?:Front['status'];ids?:string[];orderDate?:string;orderSnapshot?:string;changeId?:string;index?:number;targetId?:string;where?:string;question?:string;event?:CalendarEvent;eventId?:string;profile?:Profile;conflictId?:string;warningId?:string;seen?:boolean;rhythm?:Rhythm};
// “Olduğu gibi ekle” (5 Ekim): the text becomes a move exactly as written — no model, no move rules, only the length
// limit — at the end of the chosen front's queue (the next move when it has none open). A new front opens as İş (K7),
// active; a front gone in the meantime comes back under its id and title, so a queued entry never blocks the device
// queue. `today` follows “Cephe ekle / çıkar”: an active front not yet on today's route joins it at the end.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function addMove(n:State,c:Command){
 const text=moveText(c.text??''),title=moveText(c.title??'').slice(0,90),at=new Date().toISOString();if(!text)throw Error('Önce eklemek istediğini yaz.');if(text.length>MOVE_LIMIT)throw Error(`Hamle en fazla ${MOVE_LIMIT} karakter olabilir.`);
 const id=UUID.test(c.frontId??'')?c.frontId!:uid(),f=n.fronts[c.frontId??'']??(title?Object.values(n.fronts).find(x=>x.status!=='closed'&&normalize(x.title)===normalize(title))??(n.fronts[id]={id,title,type:'general',status:'active',moves:[],where:'',question:'',notes:[],touched:at}):undefined);if(!f)throw Error('Cephe bulunamadı.');
 reopen(f);
 f.moves.push({id:uid(),text,userEdited:true});f.touched=at;replaceSlot(n,f);
 // A queued entry carries the day it was chosen for; past 04:00 that order is history and the move only joins its front.
 if(c.today&&(!c.orderDate||c.orderDate===dayKey())){const date=dayKey(),o=n.orders[date]??=propose(n,date),m=nextMove(f);if(f.status==='active'&&m&&!o.slots.some(x=>x.frontId===f.id))o.slots.push({frontId:f.id,moveId:m.id,text:m.text,reason:'Senin seçtiğin cephe.'});}
}
// A completion asks the model only to read the user's note (a project's “Nerede kaldın?”); “Bitti” alone never does.
// Older “Bitti” requests were stored with the server's own placeholder; resent (Tekrar dene, recovery) they carry no note.
export const COMPLETE_PLACEHOLDER='Hamleyi tamamladım.';
export const needsModel=(c:{kind:string;skip?:boolean;text?:string})=>{const note=c.text?.trim();return c.kind==='dictate'||(c.kind==='complete'&&!c.skip&&!!note&&note!==COMPLETE_PLACEHOLDER);};
// “Berthier önersin” (5 Ekim): the model only on the user's tap, for one front left without a next move. Its moves for
// that front go to the end of the queue (the first may carry a prerequisite); nothing else changes.
export function applySuggestion(s:State,frontId:string,p:Parsed):State{
 // A move the front already has — open, just finished or taken out with Kaldır — is not brought back.
 const f=s.fronts[frontId];if(!f||f.status==='closed')throw Error('Cephe bulunamadı.');const item=p.question?undefined:p.items.find(x=>x.id===frontId||canonicalTitle(x.title)===canonicalTitle(f.title)),known=new Set(f.moves.map(m=>normalize(m.text))),moves=(item?.moves??[]).filter(text=>!known.has(normalize(text))&&!!known.add(normalize(text)));if(!moves.length)throw Error('Berthier bu cephe için yeni bir hamle bulamadı. Olduğu gibi ekleyebilirsin.');
 return commitChanges(s,'Berthier hamle önerdi',n=>{const front=n.fronts[frontId];for(const text of moves)front.moves.push({id:uid(),text,...(text===item!.moves[0]&&item!.prerequisite?{directGoal:item!.prerequisite.goal,prerequisiteReason:item!.prerequisite.reason}:{})});front.touched=new Date().toISOString();replaceSlot(n,front);});
}
export function act(s:State,c:Command):State{
 if(c.kind==='undo')return undo(s,c.changeId!,c.index);
const closing=c.kind==='closeFronts'?[...new Set(c.ids??[])].filter(id=>s.fronts[id]&&s.fronts[id].status!=='closed').length:0;
const label=ROUTINE_KINDS.includes(c.kind)?routineLabel(c):c.kind==='rekind'?'Tür değiştirildi':c.kind==='retype'?'Cephe türü değiştirildi':c.kind==='closeFronts'?`${closing} cephe kapatıldı`:undefined;
 // A dictation item moved to another kind (or merged into a routine from the receipt) keeps the receipt's trail.
 let moved:Moved|undefined,closed=false;
 const result=commitChanges(s,label??(c.kind==='seenConflict'&&c.seen===false?'Çakışma yeniden açıldı':({addMove:'Hamle eklendi',removeMove:'Hamle kaldırıldı',approve:'Günün emri onaylandı',select:'Günün emri değiştirildi',reorder:'Rotanın sırası değiştirildi',setup:'Aktif projeler seçildi',status:'Cephe durumu değiştirildi',skipPrerequisite:'Ön adım kaldırıldı',edit:'Hamle düzenlendi',complete:'Hamle tamamlandı',merge:'Cepheler birleştirildi',event:'Tarihli kalem düzenlendi',cancelEvent:'Tarihli kalem kaldırıldı',profile:'Mail imzası kaydedildi',rhythm:'Ritim ayarı değiştirildi',seenConflict:'Çakışma görüldü',reviewStart:'Teftiş başladı',reviewStep:'Teftiş adımı',reviewFinish:'Teftiş tamamlandı',reviewContinue:'Cephe sürdürülüyor',ideaAssign:'Depo kalemi projeye atandı',ideaDecide:c.decision==='discard'?'Depo kalemi atıldı':c.decision==='keep'?'Depo kalemi depoda kaldı':'Depo kalemi hamleye çevrildi'} as Record<string,string>)[c.kind]??'Değişiklik'),n=>{
 const f=c.frontId?n.fronts[c.frontId]:undefined;
 if(['status','edit','skipPrerequisite','complete','merge','removeMove'].includes(c.kind)&&!f)throw Error('Cephe bulunamadı.');
 if(['reviewStart','reviewStep','reviewFinish','reviewContinue','ideaAssign','ideaDecide'].includes(c.kind)){researchAct(n,c);return;}
 if(c.kind==='rekind'){moved=rekind(n,c);return;}
 if(c.kind==='retype'){retype(n,c);if(n.review&&!n.review.completedAt)n.review.decisions.push(`${n.fronts[c.frontId!].title}: tür değişti.`);return;}
 if(ROUTINE_KINDS.includes(c.kind)){const target=c.kind==='routineMerge'?n.routines?.[c.targetId??'']:undefined;routineAct(n,c);if(target&&c.sourceId&&c.ref)moved={sourceId:c.sourceId,ref:c.ref,to:'routine',newRef:'routine:'+target.id,key:'routine:'+target.id,text:target.title,note:`${withName(target.title)} birleşti`};return;}
 switch(c.kind){
 case 'event':{const e=c.event!;if(!e||!n.events?.[e.id])throw Error('Tarihli kalem bulunamadı.');if(e.date&&!validDate(e.date)||e.time&&!validTime(e.time)||e.endTime&&(!validTime(e.endTime)||!e.time||e.endTime<=e.time))throw Error('Tarih veya saat geçersiz.');if(e.frontId&&!n.fronts[e.frontId])throw Error('Cephe bulunamadı.');n.events[e.id]=e;syncPlans(n,calendarDay());break;}
 case 'cancelEvent':if(!n.events?.[c.eventId!])throw Error('Kalem bulunamadı.');n.events[c.eventId!].cancelled=true;syncPlans(n,calendarDay());break;
 case 'profile':n.profile=c.profile;break;
 case 'rhythm':{const r=c.rhythm;if(!r||![r.report,r.reviewTime,r.quietFrom,r.quietTo].every(validTime)||!Number.isInteger(r.reviewDay)||r.reviewDay<0||r.reviewDay>6)throw Error('Saat veya gün geçersiz.');n.rhythm={report:r.report,reviewDay:r.reviewDay,reviewTime:r.reviewTime,quietFrom:r.quietFrom,quietTo:r.quietTo};break;}
 case 'seenConflict':if(c.seen===false){n.seenConflicts=(n.seenConflicts??[]).filter(id=>id!==c.conflictId);if(n.seenWarnings)delete n.seenWarnings[c.conflictId!];}else{n.seenConflicts=[...new Set([...(n.seenConflicts??[]),c.conflictId!])];(n.seenWarnings??={})[c.conflictId!]=new Date().toISOString();}break;
 // Morning report records: the first opening of the day (also the expedition's first day) and seen preparation warnings.
 case 'reportOpen':{const d=dayKey();((n.metrics??={}).reportOpenedAt??={})[d]??=new Date().toISOString();n.expedition??={startedAt:d};break;}
 case 'seenWarning':if(!c.warningId)throw Error('Uyarı bulunamadı.');if(c.seen===false){if(n.seenWarnings)delete n.seenWarnings[c.warningId];}else (n.seenWarnings??={})[c.warningId]=new Date().toISOString();break;

 case 'setup':for(const front of Object.values(n.fronts))if(front.type==='lane'&&(front.status!=='closed'||c.ids?.includes(front.id)))front.status=c.ids?.includes(front.id)?'active':'held';n.setup=true;if(n.review&&!n.review.completedAt)n.review.decisions.push('Aktif proje seçimi kaydedildi.');break;
 case 'approve':{const date=dayKey();const o=n.orders[date]??propose(n);n.orders[date]={...o,approvedAt:new Date().toISOString()};n.expedition??={startedAt:date};break;}
 case 'reorder':{const date=dayKey(),old=n.orders[date]??propose(n);if(c.orderDate!==date||c.orderSnapshot!==JSON.stringify(old))throw Error('Günün emri değişti. Güncel sırayı açıp yeniden dene.');const ids=c.ids??[];if(ids.length!==old.slots.length||new Set(ids).size!==ids.length||ids.some(id=>!old.slots.some(x=>x.frontId===id)))throw Error('Sıra, emirdeki tüm cepheleri birer kez içermeli.');if(old.slots.some((x,i)=>x.doneAt&&ids[i]!==x.frontId))throw Error('Geçilen kampların yeri değişmez.');n.orders[date]={...old,slots:ids.map(id=>old.slots.find(x=>x.frontId===id)!)};break;}
 case 'select':{const date=dayKey(),old=n.orders[date]??propose(n),passed=old.slots.filter(x=>x.doneAt);const ids=[...new Set(c.ids??[])].filter(id=>!passed.some(x=>x.frontId===id));const chosen=ids.map(id=>{const front=n.fronts[id];if(!front||front.status!=='active'||!nextMove(front))throw Error('Yalnızca aktif, açık hamlesi olan cepheler seçilebilir.');const previous=old.slots.find(x=>x.frontId===id);return {frontId:id,moveId:nextMove(front)!.id,text:nextMove(front)!.text,reason:previous?.reason??'Senin seçtiğin cephe.'};});const slots=old.slots.flatMap(x=>x.doneAt?[x]:chosen.length?[chosen.shift()!]:[]);n.orders[date]={...old,slots:slots.concat(chosen)};break;}
 case 'status':if(c.status==='held'&&f!.type!=='lane')throw Error('Bekletme yalnız projeler için kullanılır.');if(!['active','held','closed'].includes(c.status??''))throw Error('Geçersiz durum.');f!.status=c.status!;if(c.status==='closed')f!.closedAt??=new Date().toISOString();else delete f!.closedAt;if(n.review&&!n.review.completedAt)n.review.decisions.push(f!.title+': '+({active:'aktif',held:'bekletildi',closed:'kapatıldı'}[c.status!]));f!.touched=new Date().toISOString();break;
 case 'skipPrerequisite':case 'edit':{const text=c.kind==='skipPrerequisite'?directGoal(f!):c.text?.trim();if(!text||!validMove(text))throw Error('Nesnesi belli, en fazla 120 karakterlik bir eylem yaz.');const m=nextMove(f!);if(m){if(m.text!==text)(n.movePreferences??=[]).push({frontTitle:f!.title,before:m.text,after:text,at:new Date().toISOString()});m.text=text;m.userEdited=true;delete m.directGoal;delete m.prerequisiteReason;}else{f!.moves.push({id:uid(),text});reopen(f!);}f!.touched=new Date().toISOString();replaceSlot(n,f!);break;}
 case 'addMove':addMove(n,c);break;
 // Kaldır (5 Ekim): nothing is deleted. The move keeps its place on record with removedAt; today's slot takes the
 // front's next move (or leaves the route when none is left). The change takes it back.
 case 'removeMove':{const m=f!.moves.find(x=>x.id===c.moveId);if(!m||!isOpen(m))throw Error('Hamle bulunamadı; bitmiş ya da kaldırılmış olabilir.');m.removedAt=new Date().toISOString();f!.touched=m.removedAt;replaceSlot(n,f!);break;}
 // Harita › Seç: the chosen fronts close together (one change, one “Geri al”) and leave today's route; passed camps stay.
 case 'closeFronts':{const ids=[...new Set(c.ids??[])],at=new Date().toISOString();if(!ids.length)throw Error('Kapatılacak cepheyi seç.');for(const id of ids){const x=n.fronts[id];if(!x)throw Error('Cephe bulunamadı.');if(x.status==='closed')continue;x.status='closed';x.closedAt??=at;x.touched=at;if(n.review&&!n.review.completedAt)n.review.decisions.push(x.title+': kapatıldı');}const o=n.orders[dayKey()];if(o)o.slots=o.slots.filter(x=>!!x.doneAt||!ids.includes(x.frontId));break;}
 // Bitti (5 Ekim): no model. The next move in the queue moves up; an İş front with nothing left closes (K7: kısa, bitince
 // kapanır) in the same change, so one “Geri al” reopens it. Ders and Başvuru stay open without a next move.
 case 'complete':{const m=nextMove(f!);if(!m)throw Error('Tamamlanacak hamle yok.');materializeOrder(n,f!.id);m.doneAt=new Date().toISOString();if(c.where!==undefined)f!.where=c.where;if(c.question!==undefined)f!.question=c.question;f!.touched=new Date().toISOString();if(f!.type==='general'&&f!.status!=='closed'&&!openMoves(f!).length){f!.status='closed';f!.closedAt??=m.doneAt;closed=true;}replaceSlot(n,f!,m);break;}
 case 'merge':{const target=n.fronts[c.targetId??''];if(!target||target.id===f!.id)throw Error('Birleştirilecek cephe bulunamadı.');for(const i of Object.values(n.ideas??{}))if(i.laneId===f!.id)i.laneId=target.id;for(const e of Object.values(n.events??{}))if(e.frontId===f!.id)e.frontId=target.id;target.moves.push(...f!.moves);target.notes.push(...f!.notes);target.where=target.where||f!.where;target.question=target.question||f!.question;target.touched=new Date().toISOString();f!.status='closed';f!.closedAt??=new Date().toISOString();for(const o of Object.values(n.orders)){if(o.date!==dayKey())continue;const seen=new Set<string>();o.slots=o.slots.map(x=>x.frontId===f!.id?{...x,frontId:target.id}:x).filter(x=>!seen.has(x.frontId)&&!!seen.add(x.frontId));}break;}
 default:throw Error('İşlem tanınmadı.');
 }
 });
 if(moved&&result.changes.length>s.changes.length)result.changes.at(-1)!.moved=moved;
 if(closed&&result.changes.length>s.changes.length)result.changes.at(-1)!.label='Hamle tamamlandı; cephe kapandı';
 return result;
}
