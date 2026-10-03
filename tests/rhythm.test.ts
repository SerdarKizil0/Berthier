import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,dayKey,ensureOrder,nextMove,undo,commitChanges,type State} from '../lib/domain';
import {act,applyParsed} from '../lib/reducer';
import {ensureRhythm,buildMorningReport,expeditionDays,expeditionMetrics,preferences,isQuietTime,attachReportAnswer,attachReportQuestions,reportSummary} from '../lib/rhythm';
import {addDays,type CalendarEvent} from '../lib/calendar';
const sample=()=>applyParsed(fresh(),{items:[{id:null,title:'İstatistik',type:'course',complete:false,completedMoveId:null,moves:['İlk üç örnek soruyu çöz.','Yanlış çözümleri deftere yaz.'],where:null,question:null}],question:null,summary:'İşlendi'},'Örnek');
const event=(id:string):CalendarEvent=>({id,title:id,kind:'appointment',frontId:null,date:'2026-10-01',time:'10:00',endTime:'11:00',location:'Laboratuvar',bring:['Defter'],weekly:false,prepDays:null,documents:[],institution:'',program:'',portal:''});

test('First dictation populates an early empty report; explicit selection remains stable',()=>{
 const initial=ensureRhythm(fresh()),source=sample();let s=commitChanges(initial,'İlk cephe',n=>{n.fronts=source.fronts;});
 assert.equal(ensureOrder(s).slots.length,1);assert.equal(s.reports![dayKey()].order.slots.length,1);
 s=act(s,{id:'select',kind:'select',ids:[]});s=commitChanges(s,'Yeni cephe',n=>{const f=structuredClone(Object.values(source.fronts)[0]);f.id='second';n.fronts[f.id]=f;});assert.equal(ensureOrder(s).slots.length,0);
});
test('Reading a report cannot block undo of a preceding route edit',()=>{
 let s=ensureRhythm(sample());s=act(s,{id:'a',kind:'approve'});const change=s.changes.at(-1)!.id;s=act(s,{id:'o',kind:'reportOpened'});s=undo(s,change);assert.equal(ensureOrder(s).approvedAt,undefined);assert.ok(s.reports![dayKey()].openedAt);
});
test('New conflicts and questions appear in the current report with reversible changes',()=>{
 let s=ensureRhythm(sample());const original=s;const e=event('new');e.date=dayKey();s=commitChanges(s,'Takvim değişti',n=>{n.events={a:e,b:{...e,id:'other'}};});
 assert.equal(s.reports![dayKey()].alerts.length,1);assert.equal(s.reports![dayKey()].generatedAt,original.reports![dayKey()].generatedAt);
 const before=s;s=attachReportQuestions(before,structuredClone(s),[{id:'q',raw:'Saat?',context:null,created_at:new Date().toISOString(),status:'question',result:JSON.stringify({question:'Hangi saat?'})}]);
 assert.equal(s.reports![dayKey()].decisions.questions[0].text,'Hangi saat?');s=undo(s,s.changes.at(-1)!.id);assert.equal(s.reports![dayKey()].decisions.questions.length,0);
});
test('Stale completion ids cannot complete a different move',()=>{
 const s=sample(),f=Object.values(s.fronts)[0];assert.throws(()=>act(s,{id:'bad',kind:'complete',frontId:f.id,moveId:'stale'}),/değişti/);assert.ok(!f.moves[0].doneAt);
});

test('Completed route camp keeps the original snapshot and undo restores it atomically',()=>{
 let s=ensureRhythm(sample()),id=Object.keys(s.fronts)[0];s=act(s,{id:'approve',kind:'approve'});const original=ensureOrder(s).slots[0];s=act(s,{id:'complete',kind:'complete',frontId:id});const change=s.changes.at(-1)!;
 assert.equal(ensureOrder(s).slots[0].moveId,original.moveId);assert.equal(ensureOrder(s).slots[0].text,original.text);assert.ok(ensureOrder(s).slots[0].doneAt);assert.notEqual(nextMove(s.fronts[id])?.id,original.moveId);assert.ok(s.reports?.[dayKey()].order.slots[0].doneAt);assert.throws(()=>undo(s,change.id,0));
 s=undo(s,change.id);assert.equal(ensureOrder(s).slots[0].doneAt,undefined);assert.equal(nextMove(s.fronts[id])?.id,original.moveId);
});
test('Completion before approval records the proposed order and finished camps survive selection',()=>{
 let s=sample(),id=Object.keys(s.fronts)[0];s=act(s,{id:'complete',kind:'complete',frontId:id});s=act(s,{id:'select',kind:'select',ids:[]});assert.equal(ensureOrder(s).slots.length,1);assert.ok(ensureOrder(s).slots[0].doneAt);assert.equal(ensureOrder(s).approvedAt,undefined);
});
test('Early report has an honest time and refreshes once at 08:00 with order and reading time preserved',()=>{
 const before=new Date('2026-10-01T04:30:00Z'),ready=new Date('2026-10-01T05:00:00Z');let s=ensureRhythm(sample(),[],before);assert.equal(s.reports?.['2026-10-01'].generatedAt,before.toISOString());s.reports!['2026-10-01'].openedAt=before.toISOString();const refreshed=ensureRhythm(s,[],ready);assert.equal(refreshed.reports!['2026-10-01'].generatedAt,ready.toISOString());assert.equal(refreshed.reports!['2026-10-01'].openedAt,before.toISOString());assert.equal(ensureRhythm(refreshed,[],new Date('2026-10-01T06:00:00Z')),refreshed);
});
test('The 08:00 refresh cannot block undo of a completion or roll back its preparation time',()=>{
 const date=dayKey(),early=new Date(date+'T04:30:00Z'),ready=new Date(date+'T05:00:00Z');
 let s=ensureRhythm(sample(),[],early);const frontId=Object.keys(s.fronts)[0],moveId=nextMove(s.fronts[frontId])!.id;
 s=act(s,{id:'open',kind:'reportOpened'});const openedAt=s.reports![date].openedAt;
 s=act(s,{id:'done',kind:'complete',frontId,moveId});const change=s.changes.at(-1)!.id;
 s=ensureRhythm(s,[],ready);assert.ok(s.reports![date].order.slots[0].doneAt);
 s=undo(s,change);assert.equal(nextMove(s.fronts[frontId])!.id,moveId);assert.equal(s.reports![date].order.slots[0].doneAt,undefined);assert.equal(s.reports![date].generatedAt,ready.toISOString());assert.equal(s.reports![date].openedAt,openedAt);
});
test('Answered questions and their undo remain available after the 08:00 refresh',()=>{
 const date=dayKey(),early=new Date(date+'T04:30:00Z'),ready=new Date(date+'T05:00:00Z'),question={id:'q',raw:'Saat?',context:null,created_at:early.toISOString(),status:'question',result:JSON.stringify({question:'Hangi saat?'})};
 const before=ensureRhythm(sample(),[question],early);let s=attachReportAnswer(before,structuredClone(before),'q','10:30',early);const change=s.changes.at(-1)!.id;
 s=ensureRhythm(s,[{...question,status:'answered'}],ready);assert.equal(s.reports![date].decisions.questions[0].answer,'10:30');assert.equal(s.reports![date].decisions.questions[0].answerChangeId,change);
 s=undo(s,change);assert.equal(s.reports![date].decisions.questions[0].answeredAt,undefined);assert.equal(s.reports![date].generatedAt,ready.toISOString());
});
test('Report always has all four sections, includes overnight conflicts and real locations',()=>{
 const s=fresh();s.events={a:event('a'),b:event('b')};s.events.b.time='10:30';const report=buildMorningReport(s,[],new Date('2026-10-01T05:00:00Z'));assert.equal(report.order.slots.length,0);assert.equal(report.alerts.length,1);assert.equal(report.alerts[0].kind,'conflict');assert.equal(report.places.today.length,2);assert.deepEqual(report.places.tomorrow,[]);assert.equal(report.decisions.drafts.length,1);assert.deepEqual(report.decisions.questions,[]);assert.match(reportSummary(report),/1 uyarı, 2 yer/);
 const empty=buildMorningReport(fresh(),[],new Date('2026-10-01T05:00:00Z'));assert.match(reportSummary(empty),/Uyarı, yer ve bekleyen karar da yok/);
});
test('Preparation warnings can be seen and undone without changing the route',()=>{
 let s=sample();const front=Object.values(s.fronts)[0];s.events={prep:{...event('prep'),date:dayKey(),frontId:front.id}};front.moves[0].eventId='prep';s=ensureRhythm(s);const alertId=s.reports![dayKey()].alerts[0].id;s=act(s,{id:'seen',kind:'reportAlertSeen',alertId,seen:true});assert.ok(s.reports![dayKey()].alerts[0].seenAt);s=undo(s,s.changes.at(-1)!.id);assert.equal(s.reports![dayKey()].alerts[0].seenAt,undefined);
});
test('Notification settings persist and undo; quiet hours cover midnight and evening uses quarter hours',()=>{
 let s=sample();const original=preferences(s);s=act(s,{id:'prefs',kind:'notificationPreferences',preferences:{eveningTime:'22:15'}});assert.equal(preferences(s).eveningTime,'22:15');assert.equal(expeditionMetrics({...s,expedition:{startedOn:dayKey()}}).settingChanges,1);s=undo(s,s.changes.at(-1)!.id);assert.deepEqual(preferences(s),original);assert.equal(isQuietTime('23:00'),true);assert.equal(isQuietTime('07:29'),true);assert.equal(isQuietTime('07:30'),false);assert.equal(isQuietTime('22:59'),false);assert.throws(()=>act(s,{id:'x',kind:'notificationPreferences',preferences:{eveningTime:'22:11'}}));
});
test('Journal is neutral on empty days, has fourteen entries and metrics use only the trial',()=>{
 const now=new Date('2026-10-05T12:00:00Z'),s=fresh();s.expedition={startedOn:'2026-10-01'};s.orders['2026-10-01']={date:'2026-10-01',slots:[{frontId:'f',moveId:'m',text:'Soruları çöz.',reason:'',doneAt:'2026-10-01T10:00:00Z'}]};s.orders['2026-09-30']={date:'2026-09-30',slots:[{frontId:'f',moveId:'outside',text:'Dışarıda.',reason:''}]};const days=expeditionDays(s,now);assert.equal(days.length,14);assert.equal(days[0].status,'completed');assert.equal(days[1].status,'rest');assert.equal(days[1].summary,'Karargâhta. Bu gün için emir yoktu.');assert.equal(days[5].status,'future');assert.equal(expeditionMetrics(s,now).completionRate,1);assert.equal(expeditionMetrics(s,now).day,5);
});
test('Report opening is idempotent, approval duration survives completion and approval can be taken back',()=>{
 let s=ensureRhythm(sample());const count=s.changes.length;s=act(s,{id:'open',kind:'reportOpened'});const first=s.reports![dayKey()].openedAt;s=act(s,{id:'open2',kind:'reportOpened'});assert.equal(s.reports![dayKey()].openedAt,first);assert.equal(s.changes.length,count);s=act(s,{id:'approve',kind:'approve'});s=act(s,{id:'done',kind:'complete',frontId:Object.keys(s.fronts)[0]});assert.equal(expeditionMetrics(s).approvalSamples,1);s=act(s,{id:'unapprove',kind:'reportUnapprove'});assert.equal(ensureOrder(s).approvedAt,undefined);assert.equal(s.reports![dayKey()].approvedAt,undefined);assert.ok(ensureOrder(s).slots[0].doneAt);
});
test('A single reflection becomes available on day 14 and its answer can be undone',()=>{
 let s:State={...fresh(),expedition:{startedOn:addDays(dayKey(),-12)}};assert.throws(()=>act(s,{id:'early',kind:'expeditionReflection',answer:'Evet'}));s.expedition!.startedOn=addDays(dayKey(),-13);s=act(s,{id:'reflection',kind:'expeditionReflection',answer:'Evet, seyreldi.'});assert.equal(s.expedition?.reflection?.answer,'Evet, seyreldi.');assert.equal(expeditionMetrics(s).reflectionDue,false);assert.throws(()=>act(s,{id:'again',kind:'expeditionReflection',answer:'Evet'}));s=undo(s,s.changes.at(-1)!.id);assert.equal(expeditionMetrics(s).reflectionDue,true);
});
test('An answer and its report receipt are one reversible change',()=>{
 const before=ensureRhythm(sample());before.reports![dayKey()].decisions.questions.push({id:'q',text:'Kaç dakika?',frontId:null});const after=attachReportAnswer(before,act(before,{id:'edit',kind:'edit',frontId:Object.keys(before.fronts)[0],text:'İlk soruyu deftere yaz.'}),'q','15 dakika');assert.equal(after.reports![dayKey()].decisions.questions[0].answer,'15 dakika');const change=after.changes.at(-1)!;assert.equal(after.reports![dayKey()].decisions.questions[0].answerChangeId,change.id);const restored=undo(after,change.id);assert.equal(restored.reports![dayKey()].decisions.questions[0].answeredAt,undefined);assert.equal(nextMove(restored.fronts[Object.keys(restored.fronts)[0]])?.text,nextMove(before.fronts[Object.keys(before.fronts)[0]])?.text);
});
