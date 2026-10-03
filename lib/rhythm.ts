import {type State,type Order,type Dictation,type Slot,dayKey,propose} from './domain';
import {type CalendarEvent,addDays,daysBetween,calendarDay,conflicts,occurrences,validTime} from './calendar';

export type NotificationPreferences={morningTime:string;eveningTime:string;weeklyDay:number;weeklyTime:string;quietStart:string;quietEnd:string};
export const defaultNotificationPreferences:NotificationPreferences={morningTime:'08:30',eveningTime:'21:00',weeklyDay:0,weeklyTime:'20:00',quietStart:'23:00',quietEnd:'07:30'};
export function preferences(s:State):NotificationPreferences{return {...defaultNotificationPreferences,...s.notificationPreferences};}
export function validPreferences(p:NotificationPreferences){return [p.morningTime,p.eveningTime,p.weeklyTime,p.quietStart,p.quietEnd].every(validTime)&&Number.isInteger(p.weeklyDay)&&p.weeklyDay>=0&&p.weeklyDay<=6&&Number(p.eveningTime.slice(3))%15===0;}
export const istanbulTime=(now=new Date())=>new Date(now.getTime()+3*3600000).toISOString().slice(11,16);
export function isQuietTime(time:string,p:NotificationPreferences=defaultNotificationPreferences){return p.quietStart<=p.quietEnd?time>=p.quietStart&&time<p.quietEnd:time>=p.quietStart||time<p.quietEnd;}
export type ReportAlert={id:string;kind:'conflict'|'preparation';text:string;createdAt:string;conflictId?:string;eventId?:string;seenAt?:string};
export type ReportQuestion={id:string;text:string;frontId:string|null;answeredAt?:string;answer?:string;answerChangeId?:string};
export type ReportDraft={id:string;title:string;conflictId:string};
export type MorningReport={date:string;generatedAt:string;order:Order;alerts:ReportAlert[];places:{today:CalendarEvent[];tomorrow:CalendarEvent[]};decisions:{questions:ReportQuestion[];drafts:ReportDraft[]};openedAt?:string;approvedAt?:string};
export type Expedition={startedOn:string;reflection?:{answer:string;at:string}};

function questionText(d:Dictation){try{const result=JSON.parse(d.result??'{}');return typeof result.question==='string'?result.question:'';}catch{return '';}}
export function buildMorningReport(s:State,dictations:Dictation[]=[],now=new Date()):MorningReport{
 const date=dayKey(now),today=calendarDay(now),tomorrow=addDays(today,1),generatedAt=now.toISOString(),events=Object.values(s.events??{}),clashes=conflicts(events,today);
 const alerts:ReportAlert[]=clashes.map(c=>({id:'conflict:'+c.id,kind:'conflict',conflictId:c.id,text:`${c.a.date} ${c.a.time} ${c.a.title}, ${c.b.time} ${c.b.title} ile çakışıyor. ${c.reason}`,createdAt:generatedAt,...(s.seenConflicts?.includes(c.id)?{seenAt:generatedAt}:{})}));
 for(const event of occurrences(events,today,addDays(today,3))){const remaining=event.frontId?s.fronts[event.frontId]?.moves.filter(m=>m.eventId===event.id&&!m.doneAt)??[]:[];if(!remaining.length)continue;alerts.push({id:`preparation:${event.id}:${event.date}`,kind:'preparation',eventId:event.id,text:`${event.title}: ${daysBetween(today,event.date!)} gün kaldı; ${remaining.length} hazırlık hamlesi açık.`,createdAt:generatedAt});}
 const questions=dictations.filter(d=>d.status==='question').map(d=>({id:d.id,text:questionText(d),frontId:d.context})).filter(q=>q.text);
 const order=structuredClone(s.orders[date]??propose(s,date));
 return {date,generatedAt,order,alerts,places:{today:occurrences(events,today,today).filter(e=>!!e.location.trim()),tomorrow:occurrences(events,tomorrow,tomorrow).filter(e=>!!e.location.trim())},decisions:{questions,drafts:clashes.filter(c=>!s.seenConflicts?.includes(c.id)).map(c=>({id:'draft:'+c.id,title:`${c.move.title} için başka saat isteği`,conflictId:c.id}))},...(order.approvedAt?{approvedAt:order.approvedAt}:{})};
}

// A first visit before 08:00 gets an honest early report. Changes keep its content
// synchronized, so the 08:00 refresh only advances its preparation timestamp.
export function ensureRhythm(s:State,dictations:Dictation[]=[],now=new Date()):State{
 const date=dayKey(now),old=s.reports?.[date],refresh=old&&calendarDay(new Date(old.generatedAt))===calendarDay(now)&&istanbulTime(new Date(old.generatedAt))<'08:00'&&istanbulTime(now)>='08:00';
 if(old&&!refresh&&s.expedition)return s;
 const n=structuredClone(s);n.expedition??={startedOn:date};n.reports??={};
 if(!old)n.reports[date]=buildMorningReport(n,dictations,now);
 else if(refresh)n.reports[date].generatedAt=now.toISOString();
 return n;
}
export function currentReport(s:State,now=new Date()){return s.reports?.[dayKey(now)]??Object.values(s.reports??{}).sort((a,b)=>b.date.localeCompare(a.date))[0];}
export function reportSummary(r:MorningReport){const camps=r.order.slots.length,warnings=r.alerts.filter(a=>!a.seenAt).length,places=r.places.today.length+r.places.tomorrow.length,decisions=r.decisions.questions.filter(q=>!q.answeredAt).length+r.decisions.drafts.length;return !camps&&!warnings&&!places&&!decisions?'Bugün için önerilen cephe yok. Uyarı, yer ve bekleyen karar da yok.':`Önerilen emir: ${camps} cephe. ${warnings} uyarı, ${places} yer, kararını bekleyen ${decisions} konu.`;}
export function syncReportOrder(s:State,date=dayKey()){const report=s.reports?.[date],order=s.orders[date];if(report&&order){report.order=structuredClone(order);report.approvedAt=order.approvedAt;}}
// Changes to today's fronts/calendar update the report within their reversible operation.
// Opening the report is observational metadata, and never changes its prepared time.
export function syncCurrentReport(s:State,dictations?:Dictation[],now=new Date()){
 const date=dayKey(now),old=s.reports?.[date];if(!old)return;
 const next=buildMorningReport(s,dictations??[],now);next.generatedAt=old.generatedAt;next.openedAt=old.openedAt;
 next.alerts=next.alerts.map(a=>{const previous=old.alerts.find(x=>x.id===a.id);return {...a,createdAt:previous?.createdAt??a.createdAt,...(previous?.seenAt?{seenAt:previous.seenAt}:{})};});
 next.decisions.questions=dictations?next.decisions.questions.map(q=>({...q,...old.decisions.questions.find(x=>x.id===q.id)})).concat(old.decisions.questions.filter(q=>q.answeredAt&&!next.decisions.questions.some(x=>x.id===q.id))):old.decisions.questions;
 s.reports![date]=next;
}
export function attachReportQuestions(before:State,after:State,dictations:Dictation[]){
 syncCurrentReport(after,dictations);
 const ops=Object.entries(after.reports??{}).flatMap(([date,report])=>JSON.stringify(before.reports?.[date]??null)===JSON.stringify(report)?[]:[{key:'report:'+date,before:structuredClone(before.reports?.[date]??null),after:structuredClone(report)}]);
 if(!ops.length)return after;
 let change=after.changes.length>before.changes.length?after.changes.at(-1):undefined;
 if(!change){change={id:crypto.randomUUID(),label:'Sabah raporundaki sorular güncellendi',at:new Date().toISOString(),ops:[]};after.changes.push(change);}
 for(const op of ops){const existing=change.ops.find(x=>x.key===op.key);if(existing)existing.after=op.after;else change.ops.push(op);}
 return after;
}
export function recordReportAnswer(s:State,questionId:string,answer:string,changeId:string|undefined,now=new Date()){for(const report of Object.values(s.reports??{})){const q=report.decisions.questions.find(q=>q.id===questionId);if(q){q.answer=answer;q.answeredAt=now.toISOString();q.answerChangeId=changeId;}}}
// Keep answer display and its domain changes in the same reversible journal entry.
export function attachReportAnswer(before:State,after:State,questionId:string,answer:string,now=new Date()){
 let change=after.changes.length>before.changes.length?after.changes.at(-1):undefined;
 if(!change){change={id:crypto.randomUUID(),label:'Sorunun yanıtı kaydedildi',at:now.toISOString(),ops:[]};after.changes.push(change);}
 recordReportAnswer(after,questionId,answer,change.id,now);
 for(const [date,report] of Object.entries(after.reports??{})){const previous=before.reports?.[date]??null;if(JSON.stringify(previous)===JSON.stringify(report))continue;const key='report:'+date,op=change.ops.find(o=>o.key===key);if(op)op.after=structuredClone(report);else change.ops.push({key,before:structuredClone(previous),after:structuredClone(report)});}
 return after;
}

export type ExpeditionDay={date:string;status:'future'|'today'|'completed'|'rest'|'recorded';slots:Slot[];completed:number;total:number;summary:string;closedFronts:{id:string;title:string}[]};
export function expeditionDays(s:State,now=new Date()):ExpeditionDay[]{
 if(!s.expedition)return [];const today=dayKey(now),start=s.expedition.startedOn;
 return Array.from({length:14},(_,i)=>{const date=addDays(start,i),slots=s.orders[date]?.slots??s.reports?.[date]?.order.slots??[],done=slots.filter(x=>!!x.doneAt),closedFronts=s.changes.filter(c=>dayKey(new Date(c.at))===date).flatMap(c=>c.ops.filter(op=>!op.undone&&op.key.startsWith('front:')&&(op.before as {status?:string}|null)?.status!=='closed'&&(op.after as {status?:string}|null)?.status==='closed').map(op=>({id:op.key.slice(6),title:(op.after as {title:string}).title}))),status:ExpeditionDay['status']=date>today?'future':slots.length&&done.length===slots.length?'completed':date===today?'today':!slots.length?'rest':'recorded';
 return {date,status,slots,completed:done.length,total:slots.length,closedFronts:[...new Map(closedFronts.map(f=>[f.id,f])).values()],summary:!slots.length?'Karargâhta. Bu gün için emir yoktu.':done.length?done.map(x=>x.text.replace(/[.!]+$/,'')).join('; ')+'.':date===today?'Bugünün rotası sürüyor.':'Bu günün rotası kayıtlı.'};});
}
export function expeditionMetrics(s:State,now=new Date()){
 const days=expeditionDays(s,now).filter(d=>d.status!=='future'),start=s.expedition?.startedOn??dayKey(now),end=addDays(start,13),inRange=(date:string)=>date>=start&&date<=end&&date<=dayKey(now),reports=Object.values(s.reports??{}).filter(r=>inRange(r.date)),durations=reports.flatMap(r=>r.openedAt&&r.approvedAt&&Date.parse(r.approvedAt)>=Date.parse(r.openedAt)?[(Date.parse(r.approvedAt)-Date.parse(r.openedAt))/1000]:[]),changes=s.changes.filter(c=>inRange(dayKey(new Date(c.at)))&&c.ops.some(op=>!op.undone)),completed=days.reduce((n,d)=>n+d.completed,0),total=days.reduce((n,d)=>n+d.total,0);
 return {completed,total,completionRate:total?completed/total:null,averageApprovalSeconds:durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:null,approvalSamples:durations.length,manualEdits:changes.filter(c=>c.metricKind==='manual').length,settingChanges:changes.filter(c=>c.metricKind==='setting').length,closedFronts:days.reduce((n,d)=>n+d.closedFronts.length,0),day:Math.min(14,Math.max(1,daysBetween(start,dayKey(now))+1)),reflectionDue:!!s.expedition&&dayKey(now)>=end&&!s.expedition.reflection};
}
