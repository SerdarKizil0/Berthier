import {addIdeas,researchAct,type ResearchCommand} from './research';
import {calendarDay,resolveDate,syncPlans,type CalendarEvent,type Profile,type EventKind,validDate,validTime} from './calendar';
import {type State,type Front,type Order,uid,nextMove,normalize,canonicalTitle,similarity,fallbackMove,commitChanges,undo,dayKey,propose,replaceSlot,validMove,directGoal} from './domain';
import type {Parsed} from './llm';
export function applyParsed(s:State,p:Parsed,raw:string,today=calendarDay(),sourceId:string|null=null):State{
 return commitChanges(s,p.summary||'Dikte işlendi',n=>{
 for(const item of p.items){
 let f=item.id?n.fronts[item.id]:Object.values(n.fronts).find(f=>normalize(f.title)===normalize(item.title)||(f.type===item.type&&canonicalTitle(f.title)===canonicalTitle(item.title))||similarity(f.title,item.title)>=.6);
 if(!f){f={id:uid(),title:item.title,type:item.type,status:item.type==='lane'?'held':'active',moves:[],where:'',question:'',notes:[],touched:new Date().toISOString()};n.fronts[f.id]=f;}
 if(item.complete){const m=item.completedMoveId?f.moves.find(m=>m.id===item.completedMoveId):nextMove(f);if(m)m.doneAt=new Date().toISOString();}
 if(item.where!==null)f.where=item.where;if(item.question!==null)f.question=item.question;
 if(item.moves.length){const existing=new Set(f.moves.filter(m=>!m.doneAt).map(m=>normalize(m.text)));for(const text of item.moves)if(!existing.has(normalize(text))){f.moves.push({id:uid(),text,...(text===item.moves[0]&&item.prerequisite?{directGoal:item.prerequisite.goal,prerequisiteReason:item.prerequisite.reason}:{})});existing.add(normalize(text));}}
 if(!f.moves.length&&!(p.events??[]).some(e=>e.frontTitle===f!.title&&resolveDate(e.dateText,today)))f.moves.push({id:uid(),text:fallbackMove(f)});
 f.notes.push(raw);f.touched=new Date().toISOString();if(item.complete)replaceSlot(n,f);
 }
 n.events??={};
 for(const entry of p.events??[]){const linked=entry.frontTitle?Object.values(n.fronts).find(f=>canonicalTitle(f.title)===canonicalTitle(entry.frontTitle!)):null;const old:CalendarEvent|undefined=entry.id?n.events[entry.id]:Object.values(n.events).find(e=>normalize(e.title)===normalize(entry.title));const id=old?.id??uid();n.events[id]={id,title:entry.title,kind:entry.kind,frontId:linked?.id??old?.frontId??null,date:resolveDate(entry.dateText,today),time:entry.time,endTime:entry.endTime,location:entry.location,bring:entry.bring,weekly:entry.weekly,prepDays:entry.prepDays,documents:entry.documents,institution:entry.institution,program:entry.program,portal:entry.portal};}
 addIdeas(n,p.ideas??[],sourceId);
 for(const change of p.laneUpdates??[]){const lane=change.id?n.fronts[change.id]:Object.values(n.fronts).find(f=>f.type==='lane'&&canonicalTitle(f.title)===canonicalTitle(change.title));if(!lane||lane.type!=='lane')throw Error('Kulvar bulunamadı.');lane.status=change.status;lane.touched=new Date().toISOString();}
 if(p.prepDefaults?.length){n.prepDefaults??={};for(const d of p.prepDefaults)n.prepDefaults[d.kind]=d.days;}
 if(p.events?.length||p.prepDefaults?.length)syncPlans(n,today);
 });
}
export type Command=ResearchCommand & {id:string;kind:string;frontId?:string;text?:string;status?:Front['status'];ids?:string[];changeId?:string;index?:number;targetId?:string;where?:string;question?:string;event?:CalendarEvent;eventId?:string;profile?:Profile;conflictId?:string};
export function act(s:State,c:Command):State{
 if(c.kind==='undo')return undo(s,c.changeId!,c.index);
 return commitChanges(s,({approve:'Günün emri onaylandı',select:'Günün emri değiştirildi',setup:'Aktif kulvarlar seçildi',status:'Cephe durumu değiştirildi',skipPrerequisite:'Ön adım kaldırıldı',edit:'Hamle düzenlendi',complete:'Hamle tamamlandı',merge:'Cepheler birleştirildi',event:'Tarihli kalem düzenlendi',cancelEvent:'Tarihli kalem kaldırıldı',profile:'Mail imzası kaydedildi',seenConflict:'Çakışma görüldü'} as Record<string,string>)[c.kind]??'Değişiklik',n=>{
 const f=c.frontId?n.fronts[c.frontId]:undefined;
 if(['status','edit','skipPrerequisite','complete','merge'].includes(c.kind)&&!f)throw Error('Cephe bulunamadı.');
 if(['reviewStart','reviewStep','reviewFinish','reviewContinue','ideaAssign','ideaDecide'].includes(c.kind)){researchAct(n,c);return;}
 switch(c.kind){
 case 'event':{const e=c.event!;if(!e||!n.events?.[e.id])throw Error('Tarihli kalem bulunamadı.');if(e.date&&!validDate(e.date)||e.time&&!validTime(e.time)||e.endTime&&(!validTime(e.endTime)||!e.time||e.endTime<=e.time))throw Error('Tarih veya saat geçersiz.');if(e.frontId&&!n.fronts[e.frontId])throw Error('Cephe bulunamadı.');n.events[e.id]=e;syncPlans(n,calendarDay());break;}
 case 'cancelEvent':if(!n.events?.[c.eventId!])throw Error('Kalem bulunamadı.');n.events[c.eventId!].cancelled=true;syncPlans(n,calendarDay());break;
 case 'profile':n.profile=c.profile;break;
 case 'seenConflict':n.seenConflicts=[...new Set([...(n.seenConflicts??[]),c.conflictId!])];break;

 case 'setup':for(const front of Object.values(n.fronts))if(front.type==='lane')front.status=c.ids?.includes(front.id)?'active':'held';n.setup=true;if(n.review&&!n.review.completedAt)n.review.decisions.push('Aktif kulvar seçimi kaydedildi.');break;
 case 'approve':{const date=dayKey();const o=n.orders[date]??propose(n);n.orders[date]={...o,approvedAt:new Date().toISOString()};break;}
 case 'select':{const date=dayKey(),old=n.orders[date]??propose(n);const ids=[...new Set(c.ids??[])];const slots=ids.map(id=>{const front=n.fronts[id];if(!front||front.status!=='active'||!nextMove(front))throw Error('Yalnızca aktif, açık hamlesi olan cepheler seçilebilir.');const previous=old.slots.find(x=>x.frontId===id);return {frontId:id,moveId:nextMove(front)!.id,text:nextMove(front)!.text,reason:previous?.reason??'Senin seçtiğin cephe.'};});n.orders[date]={...old,slots};break;}
 case 'status':if(c.status==='held'&&f!.type!=='lane')throw Error('Bekletme yalnız kulvarlar için kullanılır.');if(!['active','held','closed'].includes(c.status??''))throw Error('Geçersiz durum.');f!.status=c.status!;if(n.review&&!n.review.completedAt)n.review.decisions.push(f!.title+': '+({active:'aktif',held:'bekletildi',closed:'kapatıldı'}[c.status!]));f!.touched=new Date().toISOString();break;
 case 'skipPrerequisite':case 'edit':{const text=c.kind==='skipPrerequisite'?directGoal(f!):c.text?.trim();if(!text||!validMove(text))throw Error('Nesnesi belli, en fazla 120 karakterlik bir eylem yaz.');const m=nextMove(f!);if(m){if(m.text!==text)(n.movePreferences??=[]).push({frontTitle:f!.title,before:m.text,after:text,at:new Date().toISOString()});m.text=text;m.userEdited=true;delete m.directGoal;delete m.prerequisiteReason;}else f!.moves.push({id:uid(),text});f!.touched=new Date().toISOString();replaceSlot(n,f!);break;}
 case 'complete':{const m=nextMove(f!);if(!m)throw Error('Tamamlanacak hamle yok.');m.doneAt=new Date().toISOString();if(c.where!==undefined)f!.where=c.where;if(c.question!==undefined)f!.question=c.question;f!.touched=new Date().toISOString();replaceSlot(n,f!);break;}
 case 'merge':{const target=n.fronts[c.targetId??''];if(!target||target.id===f!.id)throw Error('Birleştirilecek cephe bulunamadı.');for(const i of Object.values(n.ideas??{}))if(i.laneId===f!.id)i.laneId=target.id;for(const e of Object.values(n.events??{}))if(e.frontId===f!.id)e.frontId=target.id;target.moves.push(...f!.moves);target.notes.push(...f!.notes);target.where=target.where||f!.where;target.question=target.question||f!.question;target.touched=new Date().toISOString();f!.status='closed';for(const o of Object.values(n.orders)){if(o.date!==dayKey())continue;const seen=new Set<string>();o.slots=o.slots.map(x=>x.frontId===f!.id?{...x,frontId:target.id}:x).filter(x=>!seen.has(x.frontId)&&!!seen.add(x.frontId));}break;}
 default:throw Error('İşlem tanınmadı.');
 }
 });
}
