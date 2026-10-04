import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,commitChanges,undo,type Front,type State} from '../lib/domain';
import {act,applyParsed} from '../lib/reducer';
import {type Routine,type Session,at,dayMin,weekStart,weekLine,pastDay,observation,readyToPropose,mirror,weekPlan,weekRows,todayList,reminderFor,routineAct,routineLabel,routineNotice,scaffolds,stepMinutes,stepsOf,trialResult,proposals,type RoutineCommand} from '../lib/routines';
import {addDays} from '../lib/calendar';
import {placementsOf,effective,receiptTitle} from '../lib/kinds';
import {checkRoutines,type Parsed} from '../lib/llm';
import {describeOp,breakdown,changeNotice,changeLines,ledgerRoutines} from '../lib/ledger';
import {placeCamps} from '../lib/expedition/camps';
import {type CalendarEvent} from '../lib/calendar';
import {genitive,withName,accusative,minutesUpper,minutesText,onDate} from '../lib/turkish';

// Rutinler (design 4 Ekim): the example week is Monday 5 October 2026.
const MON='2026-10-05';
const local=(day:string,time:string)=>at(day,time);
const routine=(id:string,title:string,count:number,extra:Partial<Routine>={}):Routine=>({id,title,count,status:'observing',createdAt:'2026-09-21T07:00:00.000Z',observeFrom:'2026-09-21',timer:true,reminder:{on:false,leadMin:10},...extra});
const settled=(id:string,title:string,days:number[],time:string,minutes:number,extra:Partial<Routine>={})=>routine(id,title,days.length,{status:'settled',pattern:{days,time,minutes,approvedAt:'2026-10-05T05:40:00.000Z'},...extra});
let n=0;
const session=(routineId:string,day:string,start:string,minutes:number,source:Session['source']='timer'):Session=>({id:'x'+(++n),routineId,day,start:local(day,start).toISOString(),end:new Date(local(day,start).getTime()+minutes*60000).toISOString(),minutes,source});
const lab=(date:string):CalendarEvent=>({id:'lab',title:'Organik Kimya Lab',kind:'lab',frontId:null,date,time:'14:00',endTime:'17:00',location:'',bring:[],weekly:true,prepDays:null,documents:[],institution:'',program:'',portal:''});
const run=(s:State,c:RoutineCommand,now:Date,label='Rutin')=>commitChanges(s,label,draft=>routineAct(draft,c,now));
const parsed=(extra:Partial<Parsed>):Parsed=>({items:[],question:null,summary:'İşlendi',...extra});

test('the week turns on Monday 04:00 and routine wording reads aloud', ()=>{
 assert.equal(weekStart('2026-10-07'),MON);assert.equal(weekStart('2026-10-11'),MON);assert.equal(weekStart(MON),MON);
 assert.equal(at(MON,'00:30').toISOString(),'2026-10-05T21:30:00.000Z');
 assert.ok(dayMin('00:30')>dayMin('23:15'));
 assert.equal(weekLine(MON),'5 – 11 EKİ · HAFTANIN 1. GÜNÜ');
 assert.equal(weekLine('2026-10-01'),'28 EYL – 4 EKİ · HAFTANIN 4. GÜNÜ');
 assert.deepEqual([genitive('Yüz yogası'),genitive('Sabah sprinti'),withName('Boyun antrenmanı'),accusative('Cuma'),accusative('Pazar')],['Yüz yogasının','Sabah sprintinin','Boyun antrenmanıyla','Cuma’yı','Pazar’ı']);
 assert.deepEqual([minutesUpper(65),minutesUpper(32),minutesUpper(120),minutesText(110)],['1 SA 05 DK','32 DK','2 SA','1 sa 50 dk']);
 assert.equal(onDate(MON),'5 Ekim’de');
 assert.equal(pastDay('dün',MON),'2026-10-04');assert.equal(pastDay('Cumartesi',MON),'2026-10-03');assert.equal(pastDay('pazar',MON),'2026-10-04');assert.equal(pastDay('Pazartesi',MON),MON);assert.equal(pastDay(null,MON),MON);
});

function observed(){
 const s=fresh();s.routines={yoga:routine('yoga','Yüz yogası',4),neck:routine('neck','Boyun antrenmanı',3,{observeFrom:'2026-10-01',createdAt:'2026-10-01T07:00:00.000Z'})};
 const days:[string,string,number][]=[['2026-09-21','22:30',31],['2026-09-23','22:25',33],['2026-09-26','22:35',30],['2026-09-27','22:30',32],['2026-09-28','22:20',34],['2026-09-30','22:30',29],['2026-10-01','22:41',32],['2026-10-03','22:40',33],['2026-10-04','22:30',32]];
 s.sessions=[...days.map(([d,t,m])=>session('yoga',d,t,m)),session('neck','2026-10-01','21:00',15)];
 return s;
}

test('observation first: two weeks of records, then the pattern is mirrored back', ()=>{
 const s=observed(),card=observation(s,'2026-10-01')!;
 assert.equal(card.day,11);assert.equal(card.proposeOn,MON);
 assert.match(card.text,/5 Ekim’de haftalık düzeni önereceğim\. Bu sürede hatırlatma yok\./);
 assert.deepEqual([card.cells.filter(c=>c==='past').length,card.cells.indexOf('today')],[10,10]);
 assert.equal(readyToPropose(s,s.routines!.yoga,'2026-10-04'),false);
 assert.equal(readyToPropose(s,s.routines!.yoga,'2026-10-04',true),true);
 assert.equal(readyToPropose(s,s.routines!.yoga,MON),true);
 assert.equal(readyToPropose(s,s.routines!.neck,MON),false);
 const m=mirror(s,s.routines!.yoga,MON);
 assert.deepEqual(m.days,[1,3,6,0]);assert.equal(m.time,'22:30');assert.equal(m.minutes,32);assert.deepEqual(m.tried,[4]);
 assert.equal(m.text,'Genelde Pzt, Çar, Cmt ve Paz 22:30’da yapıyorsun; ≈32 dk sürüyor.');
 assert.deepEqual(proposals(s,MON).map(p=>p.routine.id),['yoga']);
 const rows=weekRows(s,MON);
 assert.equal(rows.find(r=>r.routine.id==='yoga')!.sub,'Haftada 4 · son Paz 22:30 · 9 ölçüm, ≈32 dk');
 assert.equal(weekRows(s,'2026-10-01').find(r=>r.routine.id==='neck')!.done,1);assert.equal(rows.find(r=>r.routine.id==='neck')!.done,0);
 // A wide spread is written as a range.
 const cook=fresh();cook.routines={c:routine('c','Yemek yapma',4)};cook.sessions=[30,35,45,60,80,90].map((m,i)=>session('c',`2026-09-2${i+1}`,'19:00',m));
 assert.equal(mirror(cook,cook.routines.c,MON).range?.join('–'),'35–85');
});

test('approving the pattern settles routines; “Yarısına” reminds one of two groups', ()=>{
 let s=observed();const now=local(MON,'08:40');
 s=run(s,{kind:'routinePatternAll',patterns:[{routineId:'yoga',days:[1,3,6,0],time:'22:30'}],reminder:'half'},now,'Haftalık düzen onaylandı');
 const yoga=s.routines!.yoga;
 assert.equal(yoga.status,'settled');assert.equal(yoga.pattern?.minutes,32);assert.equal(yoga.reminder.on,true);assert.equal(s.reminderTrial?.a[0],'yoga');
 assert.deepEqual(s.changes.at(-1)!.ops.map(o=>o.key),['routine:yoga','reminderTrial']);
 assert.equal(describeOp(s.changes.at(-1)!.ops[0],s.fronts,s.routines).tag,'DÜZEN');
 assert.throws(()=>run(s,{kind:'routineReminder',routineId:'neck',on:true},now),/Gözlem sürerken hatırlatma yok/);
 s=undo(s,s.changes.at(-1)!.id);assert.equal(s.routines!.yoga.status,'observing');assert.equal(s.reminderTrial??null,null);
});

function week(){
 const s=fresh();
 s.routines={
  sprint:settled('sprint','Sabah sprinti',[1,2,3,4,5],'07:30',20),
  hang:settled('hang','Dead hang',[1,2,3,4,5,6,0],'07:50',7,{pattern:{days:[1,2,3,4,5,6,0],time:'07:50',minutes:7,after:'sprint',approvedAt:'2026-10-05T05:40:00.000Z'}}),
  cook:settled('cook','Yemek yapma',[1,2,5,6],'19:00',55),
  yoga:settled('yoga','Yüz yogası',[1,3,6,0],'22:30',32,{reminder:{on:true,leadMin:10},ownWords:{text:'Çenemdeki gerginliği azaltıyor.',show:true,sourceId:'d0'}}),
  hair:settled('hair','Saç masajı',[1,3,6,0],'23:05',5,{reminder:{on:true,leadMin:10},pattern:{days:[1,3,6,0],time:'23:05',minutes:5,after:'yoga',approvedAt:'2026-10-05T05:40:00.000Z'}}),
  book:settled('book','Kitap okuma',[1,2,3,4,5,6,0],'23:15',30,{reminder:{on:true,leadMin:10}}),
 };
 s.sessions=[session('sprint',MON,'07:40',20),session('hang',MON,'08:01',7),session('cook',MON,'19:05',55)];
 s.events={lab:lab('2026-09-28')};
 return s;
}

test('today: done in real time, chained lines, fixed items muted, the rest of the day', ()=>{
 const s=week(),list=todayList(s,local(MON,'21:40'));
 assert.deepEqual(list.rows.map(r=>[r.time,r.title,r.sub,r.chip,r.tone]),[
  ['07:40','Sabah sprinti, dead hang','','✓ 27 DK','done'],
  ['14:00','Organik Kimya Lab','Sabit · 17:00’ye kadar','','fixed'],
  ['19:05','Yemek yapma','','✓ 55 DK','done'],
  ['22:30','Yüz yogası','Sırada · haftanın ilk seansı','≈32 DK','next'],
  ['↳','Saç masajı','Yüz yogasının ardından','≈5 DK','plan'],
  ['23:15','Kitap okuma','','≈30 DK','plan'],
 ]);
 assert.equal(list.count,6);assert.equal(list.left,67);
 const rows=weekRows(s,MON);assert.equal(rows.find(r=>r.routine.id==='yoga')!.sub,'Pzt, Çar, Cmt, Paz · 22:30');
});

test('“Bugün değil” slides the session to a free day of the week; a missed day slides too', ()=>{
 let s=week();const now=local(MON,'22:00');
 s=run(s,{kind:'routineSkip',routineId:'yoga',day:MON},now,'Bugün değil');
 assert.equal(s.skips![0].slidTo,'2026-10-06');
 assert.deepEqual(s.changes.at(-1)!.ops.map(o=>o.key),['skip:yoga:'+MON]);
 assert.equal(describeOp(s.changes.at(-1)!.ops[0],s.fronts,s.routines).text,'Yüz yogası · Salı 22:30’a kaydı');
 const list=todayList(s,now),last=list.rows.at(-1)!;
 assert.deepEqual([last.time,last.title,last.sub],['—','Yüz yogası','Bugün değil · Salı 22:30’a kaydı']);
 assert.equal(list.count,5);
 assert.equal(weekRows(s,MON).find(r=>r.routine.id==='yoga')!.sub,'Bu hafta Sal, Çar, Cmt, Paz · 22:30');
 // The chained massage now has no parent today: it keeps its own time.
 assert.equal(list.rows.find(r=>r.title==='Saç masajı')!.time,'23:05');
 // A fixed item at that time on Tuesday: the session goes to Thursday.
 let t=week();t.events!.late={...lab('2026-10-06'),id:'late',title:'Gece gözlemi',weekly:false,time:'22:00',endTime:'23:30'};
 t=run(t,{kind:'routineSkip',routineId:'yoga',day:MON},now);assert.equal(t.skips![0].slidTo,'2026-10-08');
 // Monday passed without a session: on Wednesday the week still holds four (Wed, Thu, Sat, Sun).
 const wed=week();wed.sessions=[];const plan=weekPlan(wed,wed.routines!.yoga,'2026-10-07');
 assert.deepEqual(plan.upcoming,['2026-10-07','2026-10-08','2026-10-10','2026-10-11']);
 // Every day planned: nowhere to slide, the week ends as it is.
 const daily=weekPlan(wed,wed.routines!.book,'2026-10-07');assert.equal(daily.upcoming.length,5);
 assert.throws(()=>run(s,{kind:'routineSkip',routineId:'yoga',day:MON},now),/zaten ertelendi/);
});

test('the reminder says the state, once per block, quiet hours only in the app', ()=>{
 const s=week();
 const r=reminderFor(s,local(MON,'22:20'))!;
 assert.deepEqual([r.title,r.body,r.words,r.quiet],['Yüz yogası · 22:30','Haftanın ilk seansı · ardından saç masajı · ≈37 dk · 22:30 boş','“Çenemdeki gerginliği azaltıyor.”',false]);
 assert.equal(reminderFor(s,local(MON,'22:00')),null);
 assert.equal(reminderFor(s,local(MON,'22:20'),['yoga:'+MON]),null);
 const done=structuredClone(s);done.sessions!.push(session('yoga',MON,'22:25',31),session('hair',MON,'22:57',5));
 const book=reminderFor(done,local(MON,'23:10'))!;
 assert.equal(book.title,'Kitap okuma · 23:15');assert.equal(book.quiet,true);
 // Observing routines are never reminded.
 assert.equal(reminderFor(observed(),local('2026-10-01','22:25')),null);
});

test('timer, one tap, corrections and the change log lines', ()=>{
 let s=week();const start=local(MON,'22:31');
 s=run(s,{kind:'routineStart',routineId:'yoga'},start,'Sayaç başladı');
 assert.deepEqual(s.changes.at(-1)!.ops.map(o=>o.key),['running']);
 assert.equal(describeOp(s.changes.at(-1)!.ops[0],s.fronts,s.routines).text,'Yüz yogası başladı');
 assert.throws(()=>run(s,{kind:'routineStart',routineId:'book'},start),/Önce süren sayacı bitir/);
 assert.equal(todayList(s,local(MON,'22:43')).rows.find(r=>r.tone==='running')!.chip,'12 DK');
 assert.equal(reminderFor(s,local(MON,'22:35')),null);
 s=run(s,{kind:'routineFinish'},local(MON,'23:02'),'Rutin kaydedildi');
 const x=s.sessions!.at(-1)!;assert.deepEqual([x.minutes,x.source,s.running],[31,'timer',null]);
 // The change holds that one session (and the timer stopping), not the session history.
 const done=s.changes.at(-1)!;assert.deepEqual(done.ops.map(o=>[o.key,o.before===null]),[['session:'+x.id,true],['running',false]]);assert.deepEqual(done.ops[0].after,x);
 const line=describeOp(done.ops[0],s.fronts,s.routines);assert.deepEqual([line.tag,line.text],['SEANS','Yüz yogası · 31 dk']);
 assert.equal(describeOp(done.ops[1],s.fronts,s.routines).quiet,true);
 s=run(s,{kind:'routineEdit',sessionId:x.id,minutes:28},local(MON,'23:03'));assert.equal(s.sessions!.at(-1)!.minutes,28);
 s=run(s,{kind:'routineLog',routineId:'book'},local(MON,'23:50'));assert.deepEqual([s.sessions!.at(-1)!.minutes,s.sessions!.at(-1)!.source],[30,'tap']);
 // A forgotten timer is finished with a corrected end.
 s=run(s,{kind:'routineStart',routineId:'cook'},local('2026-10-06','19:00'));
 s=run(s,{kind:'routineFinish',end:'19:50'},local('2026-10-06','23:59'));assert.equal(s.sessions!.at(-1)!.minutes,50);
 assert.equal(breakdown({...s.changes.at(-1)!,sourceId:'d'},s.fronts,s.routines),'1 seans.');
});

test('pause, merge and the scaffold suggestions', ()=>{
 let s=week();const now=local(MON,'12:00');
 s=run(s,{kind:'routinePause',routineId:'book',paused:true},now);assert.equal(s.routines!.book.status,'paused');
 s=run(s,{kind:'routinePause',routineId:'book',paused:false},now);assert.equal(s.routines!.book.status,'settled');
 s.routines!.neck=routine('neck','Boyun germe',2);s.sessions!.push(session('neck',MON,'10:00',10));
 s.routines!.neck2=routine('neck2','Boyun antrenmanı',3);
 s=run(s,{kind:'routineMerge',routineId:'neck',targetId:'neck2'},now);
 assert.equal(s.routines!.neck,undefined);assert.ok(s.sessions!.some(x=>x.routineId==='neck2'));
 const merge=s.changes.at(-1)!;assert.equal(describeOp(merge.ops[0],s.fronts,s.routines,merge).text,'Boyun germe birleştirildi');
 assert.ok(merge.ops.slice(1).every(o=>describeOp(o,s.fronts,s.routines,merge).quiet));
 // Three weeks on pattern, every week met, sessions started before the reminder; twelve steady timings.
 const q=week();q.sessions=[];
 for(const w of ['2026-10-05','2026-10-12','2026-10-19'])for(const d of [0,2,5,6])q.sessions.push(session('yoga',new Date(Date.parse(w+'T12:00:00Z')+d*86400000).toISOString().slice(0,10),'22:05',32));
 for(let i=0;i<12;i++)q.sessions.push(session('sprint',`2026-10-${String(5+i).padStart(2,'0')}`,'07:30',19+(i%4)));
 const sc=scaffolds(q,'2026-10-26');
 // Two at a time, the reminder first.
 assert.deepEqual(sc.items.map(i=>i.what+': '+i.title),['reminder: Yüz yogası kendi saatinde oluyor.','timer: Sabah sprintinin süresi oturdu.']);
 assert.equal(sc.items.find(i=>i.what==='reminder')!.text,'Son 12 seansın 12’si hatırlatmadan önce başladı. Hatırlatmayı kapatalım mı? İstersen yeniden açarsın.');
 assert.match(sc.items.find(i=>i.what==='timer')!.text,/^12 ölçüm, 19–22 dk\. Sayaç yerine “Yaptım” yeter; ≈21 dk yazılır\.$/);
 const declined=run(q,{kind:'routineScaffold',routineId:'yoga',what:'reminder',accept:false},local('2026-10-26','09:00'));
 assert.equal(scaffolds(declined,'2026-10-26').items.some(i=>i.what==='reminder'),false);
 const accepted=run(q,{kind:'routineScaffold',routineId:'sprint',what:'timer',accept:true},local('2026-10-26','09:00'));
 assert.equal(accepted.routines!.sprint.timer,false);
 // The two-week reminder trial: numbers side by side.
 q.reminderTrial={startedAt:'2026-10-05T05:40:00.000Z',a:['yoga'],b:['sprint']};
 assert.equal(trialResult(q,'2026-10-12'),null);
 assert.deepEqual(trialResult(q,'2026-10-19'),{a:{routines:1,done:8,target:8},b:{routines:1,done:12,target:10}});
});

test('a dictation places routines, sessions and pointers; the receipt names each with its second guess', ()=>{
 let s=week();s.routines!.neck2=routine('neck2','Boyun antrenmanı',3);
 const before=s;
 const p=parsed({routines:[{id:null,title:'Boyun germe',count:2,time:null,minutes:null,travel:null,ownWords:null,steps:null,alt:null}],sessions:[{routineId:'yoga',title:'Yüz yogası',dayText:null,end:null,minutes:null,skip:false,done:false},{routineId:'book',title:'Kitap okuma',dayText:'dün',end:'23:50',minutes:25,skip:false,done:true}]});
 s=applyParsed(s,p,'Haftada iki kez boyun germe yapacağım. Yüz yogası yap. Dün kitabı 25 dakika okudum.',undefined,'d1');
 const placed=placementsOf(before,s,p);
 const routineLine=placed.find(x=>x.kind==='routine'&&x.key?.startsWith('routine:'))!;
 assert.deepEqual([routineLine.text,routineLine.note,routineLine.alt?.label,routineLine.alt?.to],['Boyun germe · haftada 2','Gözlem başladı','Boyun antrenmanıyla aynı','merge']);
 const pointer=placed.find(x=>x.key===null)!;assert.equal(pointer.alt?.label,'Tek seferlik hamle yap');assert.match(pointer.text,/^Yüz yogası · /);
 const record=placed.find(x=>x.kind==='record')!;assert.equal(record.text,'Kitap okuma · 25 dk');
 assert.equal(s.sessions!.at(-1)!.source,'dictation');
 assert.deepEqual(receiptTitle(placed),{title:'Yerleştirdim.',text:'3 kalem.'});
 assert.deepEqual(receiptTitle([pointer]),{title:'Zaten düzende.',text:'Yeni hamle açmadım.'});
 assert.equal(s.changes.at(-1)!.sourceId,'d1');
 // Merging from the receipt keeps the receipt's trail.
 const id=Object.values(s.routines!).find(r=>r.title==='Boyun germe')!.id;
 s=act(s,{id:'m1',kind:'routineMerge',routineId:id,targetId:'neck2',sourceId:'d1',ref:'routine:'+id});
 assert.equal(effective(s,'d1',placed).find(x=>x.ref==='routine:neck2')!.note,'Boyun antrenmanıyla birleşti');
});

test('a move becomes a routine with one tap, and back; undo restores the move', ()=>{
 let s=fresh();
 const p=parsed({items:[{id:null,title:'Yüz yogası',type:'general',complete:false,completedMoveId:null,moves:['Yüz yogası yap.'],where:null,question:null,alt:'routine'}]});
 s=applyParsed(s,p,'Yüz yogası yap.',undefined,'d1');
 const placed=placementsOf(fresh(),s,p),move=placed[0];
 assert.deepEqual([move.kind,move.text,move.note,move.alt?.label],['move','Yüz yogası yap.','İş · bugünün rotasına önerildi','Rutin olsun']);
 assert.throws(()=>act(s,{id:'k0',kind:'rekind',sourceId:'d1',ref:move.ref,to:'routine'}),/Haftada kaç kez/);
 s=act(s,{id:'k1',kind:'rekind',sourceId:'d1',ref:move.ref,to:'routine',count:4});
 const r=Object.values(s.routines!)[0];
 assert.deepEqual([r.title,r.count,r.status,Object.keys(s.fronts).length],['Yüz yogası',4,'observing',0]);
 assert.equal(s.changes.at(-1)!.label,'Tür değiştirildi');assert.equal(s.kindPreferences!.length,1);
 const now=effective(s,'d1',placed)[0];assert.deepEqual([now.kind,now.text,now.note],['routine','Yüz yogası · haftada 4','Gözlem başladı']);
 assert.ok(s.changes.at(-1)!.ops.map(o=>describeOp(o,s.fronts).tag).includes('TÜR'));
 // Back to a one-off move: one more change, and the routine (created by that change) goes away.
 const back=act(s,{id:'k2',kind:'rekind',sourceId:'d1',ref:now.ref,to:'move'});
 assert.deepEqual([Object.keys(back.routines!).length,Object.values(back.fronts)[0].moves[0].text],[0,'Yüz yogası yap.']);
 s=undo(s,s.changes.at(-1)!.id);
 assert.equal(Object.keys(s.routines!).length,0);assert.equal(Object.values(s.fronts)[0].moves[0].text,'Yüz yogası yap.');
 assert.equal(effective(s,'d1',placed)[0].kind,'move');
});

test('a front changes type only on its page; a held project leaving Proje becomes active', ()=>{
 let s=fresh();const tez:Front={id:'tez',title:'Kargo iadesi',type:'lane',status:'held',moves:[{id:'m',text:'İade paketini PTT şubesine götür.'}],where:'',question:'',notes:[],touched:'2026-10-01T10:00:00.000Z'};
 s.fronts.tez=tez;s.ideas={i:{id:'i',text:'Kutu ölçüsünü sor',kind:'question',laneId:'tez',createdAt:'2026-10-01T10:00:00.000Z',sourceId:null,status:'stored'}};
 s=act(s,{id:'t1',kind:'retype',frontId:'tez',type:'general'});
 assert.deepEqual([s.fronts.tez.type,s.fronts.tez.status,s.ideas!.i.laneId,s.fronts.tez.was],['general','active',null,['lane']]);
 assert.equal(s.typePreferences![0].to,'general');
 assert.ok(s.changes.at(-1)!.ops.some(o=>describeOp(o,s.fronts).text==='Kargo iadesi: Proje → İş'));
 assert.throws(()=>act(s,{id:'t2',kind:'retype',frontId:'tez',type:'general'}),/zaten bu türde/);
 const asRoutine=act(s,{id:'t3',kind:'retype',frontId:'tez',type:'routine',count:2});
 assert.deepEqual([asRoutine.fronts.tez.status,Object.values(asRoutine.routines!)[0].title],['closed','Kargo iadesi']);
 s=undo(s,s.changes.at(-1)!.id);assert.deepEqual([s.fronts.tez.type,s.fronts.tez.status,s.ideas!.i.laneId],['lane','held','tez']);
 // The camp keeps its old place reserved: the fronts after it do not move.
 const fronts=['a','b','c'].map(id=>({id,type:'general' as const}));
 const was=placeCamps(fronts),moved=placeCamps([fronts[0],{id:'b',type:'course' as const,was:['general' as const]},fronts[2]]);
 assert.deepEqual([moved.a,moved.c],[was.a,was.c]);assert.notDeepEqual(moved.b,was.b);
});

test('the model output keeps rule 3 and quotes own words only', ()=>{
 const s=week(),p=parsed({items:[{id:null,title:'Yüz yogası',type:'general',complete:false,completedMoveId:null,moves:['Yüz yogası yap.'],where:null,question:null,alt:null}],routines:[{id:null,title:'Boyun germe',count:2,time:null,minutes:null,travel:20,ownWords:'Boynum ağrımasın diye',steps:null,alt:'maybe'}],sessions:[]});
 checkRoutines(p,s,'Yüz yogası yap. Haftada iki boyun germe.');
 assert.equal(p.items.length,0);assert.deepEqual(p.sessions,[{routineId:'yoga',title:'Yüz yogası',dayText:null,end:null,minutes:null,skip:false,done:false}]);
 assert.deepEqual([p.routines![0].ownWords,p.routines![0].alt],[null,null]);
 const q=parsed({routines:[],sessions:[{routineId:null,title:'Pilates',dayText:null,end:null,minutes:null,skip:false,done:true}]});
 assert.throws(()=>checkRoutines(q,s,'Pilates yaptım'),/mevcut ya da bu diktede/);
});

test('each routine record keeps its own change-log key; undo keeps a routine and its records together', ()=>{
 let s=week();
 s=run(s,{kind:'routineLog',routineId:'book'},local(MON,'23:50'),'Rutin kaydedildi');
 const c=s.changes.at(-1)!,x=s.sessions!.at(-1)!;
 assert.deepEqual(c.ops.map(o=>[o.key,o.before]),[['session:'+x.id,null]]);assert.deepEqual(c.ops[0].after,x);
 const back=undo(s,c.id);assert.deepEqual(back.sessions!.map(y=>y.id),s.sessions!.slice(0,-1).map(y=>y.id));
 // A corrected session: only that session, before and after.
 s=run(s,{kind:'routineEdit',sessionId:x.id,minutes:25},local(MON,'23:55'));
 assert.deepEqual(s.changes.at(-1)!.ops.map(o=>[o.key,(o.before as Session).minutes,(o.after as Session).minutes]),[['session:'+x.id,30,25]]);
 assert.equal(undo(s,s.changes.at(-1)!.id).sessions!.find(y=>y.id===x.id)!.minutes,30);
 // A dictation that opened a routine and wrote its session: the routine's line does not go back alone.
 const p=parsed({routines:[{id:null,title:'Pilates',count:2,time:null,minutes:null,travel:null,ownWords:null,steps:null,alt:null}],sessions:[{routineId:null,title:'Pilates',dayText:null,end:null,minutes:40,skip:false,done:true}]});
 let d=applyParsed(week(),p,'Haftada iki pilates; bugün yaptım, 40 dakika.',undefined,'d9');
 const dc=d.changes.at(-1)!,ri=dc.ops.findIndex(o=>o.key.startsWith('routine:')),si=dc.ops.findIndex(o=>o.key.startsWith('session:'));
 assert.ok(ri>=0&&si>=0);
 assert.throws(()=>undo(d,dc.id,ri),/Bu rutine bağlı kayıtlar var/);
 const id=dc.ops[ri].key.slice(8);
 // A later session too: the dictation as a whole waits for it.
 const later=run(d,{kind:'routineLog',routineId:id},new Date());
 assert.throws(()=>undo(later,dc.id),/Bu rutine bağlı kayıtlar var/);
 d=undo(d,dc.id,si);d=undo(d,dc.id,ri);
 assert.equal(d.routines![id],undefined);assert.equal(d.sessions!.some(y=>y.routineId===id),false);
 // Taken back as a whole, both go together.
 const fresh9=applyParsed(week(),p,'Haftada iki pilates; bugün yaptım, 40 dakika.',undefined,'d9'),whole=undo(fresh9,fresh9.changes.at(-1)!.id);
 assert.deepEqual([Object.values(whole.routines!).some(r=>r.title==='Pilates'),whole.sessions!.length],[false,week().sessions!.length]);
});

test('a merge moves records quietly and undoes exactly; undo never leaves a timer on a paused routine', ()=>{
 const TUE=addDays(MON,1),skip=(routineId:string,day:string)=>({routineId,day,at:local(day,'09:00').toISOString()});
 const keys=(x:State)=>(x.skips??[]).map(k=>k.routineId+':'+k.day).sort();
 let s=week();s.routines!.neck=routine('neck','Boyun germe',2,{ownWords:{text:'Boynum ağrımasın.',show:true,sourceId:'d1'}});s.routines!.neck2=routine('neck2','Boyun antrenmanı',3);
 s.skips=[skip('neck',MON),skip('neck',TUE),skip('neck2',MON)];
 s=run(s,{kind:'routineLog',routineId:'neck'},local(MON,'10:30'),'Rutin kaydedildi');
 const logged=s.changes.at(-1)!,before=s;
 s=run(s,{kind:'routineMerge',routineId:'neck',targetId:'neck2'},local(MON,'12:00'),routineLabel({kind:'routineMerge'} as RoutineCommand));
 // A day both put off stays once; the own words and the other day move along without lines of their own.
 assert.deepEqual(keys(s),['neck2:'+MON,'neck2:'+TUE]);assert.equal(s.routines!.neck2.ownWords?.text,'Boynum ağrımasın.');
 const merge=s.changes.at(-1)!;
 assert.deepEqual(changeLines(merge,s.fronts,s.routines),['Boyun germe birleştirildi']);
 assert.deepEqual(changeNotice(merge,s.fronts,s.routines),{title:'Rutinler birleştirildi.',text:''});
 assert.deepEqual(keys(undo(s,merge.id)),keys(before));
 // An earlier row keeps the merged routine's name.
 assert.equal(changeLines(logged,s.fronts,s.routines)[0],'Rutin · 30 dk');
 assert.equal(changeLines(logged,s.fronts,ledgerRoutines(s))[0],'Boyun germe · 30 dk');
 // A dictation that only refines a known routine's timing still counts as one change.
 const known=applyParsed(week(),parsed({routines:[{id:'yoga',title:'Yüz yogası',count:4,time:'22:00',minutes:20,travel:null,ownWords:null,steps:null,alt:null}]}),'Yüz yogasını genelde 22:00’de 20 dakika yapıyorum.',undefined,'d5');
 assert.deepEqual(changeNotice(known.changes.at(-1)!,known.fronts,known.routines),{title:'1 değişiklik.',text:'1 rutin.'});
 // A paused routine never keeps a running timer, whatever is taken back.
 let t=run(week(),{kind:'routineStart',routineId:'yoga'},local(MON,'22:31'));
 t=run(t,{kind:'routineFinish'},local(MON,'23:00'),'Rutin kaydedildi');const finished=t.changes.at(-1)!;
 t=run(t,{kind:'routinePause',routineId:'yoga',paused:true},local(MON,'23:05'));
 assert.throws(()=>undo(t,finished.id),/Durdurulan rutinde sayaç süremez/);
 let u=run(week(),{kind:'routinePause',routineId:'yoga',paused:true},local(MON,'21:00'));
 u=run(u,{kind:'routinePause',routineId:'yoga',paused:false},local(MON,'21:05'));const reopened=u.changes.at(-1)!;
 u=run(u,{kind:'routineStart',routineId:'yoga'},local(MON,'22:31'));
 assert.throws(()=>undo(u,reopened.id),/Durdurulan rutinde sayaç süremez/);
 // Taken back in order, all is well.
 t=undo(t,t.changes.at(-1)!.id);t=undo(t,finished.id);assert.equal(t.running?.routineId,'yoga');assert.equal(t.routines!.yoga.status,'settled');
});

test('“geçen” days, open days for “Bugün değil”, a past week’s count and a step’s own length', ()=>{
 // “geçen pazartesi” said on a Monday is a week ago.
 assert.equal(pastDay('geçen pazartesi',MON),'2026-09-28');assert.equal(pastDay('geçen pazar',MON),'2026-10-04');assert.equal(pastDay('pazartesi',MON),MON);
 // Only an open planned day is put off: not an off day, not a day already done.
 const now=local(MON,'12:00');
 assert.throws(()=>run(week(),{kind:'routineSkip',routineId:'yoga',day:'2026-10-06'},now),/açık bir seans yok/);
 assert.throws(()=>run(week(),{kind:'routineSkip',routineId:'cook',day:MON},now),/açık bir seans yok/);
 // A session of last week counts in last week, on the receipt and on the status card.
 const s=week(),p=parsed({sessions:[{routineId:'yoga',title:'Yüz yogası',dayText:'dün',end:'23:00',minutes:30,skip:false,done:true}]});
 const after=applyParsed(s,p,'Dün yüz yogası yaptım, 30 dakika.',MON,'d7');
 assert.equal(placementsOf(s,after,p,now).find(x=>x.kind==='record')!.note,'Seans yazıldı · geçen hafta 1/4');
 assert.equal(routineNotice('routineLog',s,run(s,{kind:'routineLog',routineId:'yoga',day:'2026-10-04'},now),now)!.text,'32 dk · geçen hafta 1/4.');
 // A stepped routine: “Yaptım” on a step writes that step’s length, not the whole routine’s.
 const st=week();st.routines!.mask=routine('mask','Saç maskesi',1,{steps:stepsOf([{title:'Maskeyi sür',minutes:10,wait:false},{title:'Bekle',minutes:30,wait:true},{title:'Durula',minutes:15,wait:false}])});
 const masked=run(st,{kind:'routineLog',routineId:'mask',stepKey:'s1'},now);
 assert.equal(masked.sessions!.at(-1)!.minutes,10);assert.equal(stepMinutes(masked,masked.routines!.mask,'s3'),15);
});

test('60 days of routine use: the saved state grows linearly and stays far below the D1 row limit', ()=>{
 // Ten sessions and fifteen commands a day (five timed: Başlat + Bitti; five one-tap: Yaptım), each saved as
 // the API saves it (one change and one request id).
 let s=fresh();const ids=['r1','r2','r3','r4','r5'],hour=(i:number,h:number)=>String(h+i*3).padStart(2,'0');
 s.routines=Object.fromEntries(ids.map((id,i)=>[id,settled(id,`Rutin ${i+1}`,[0,1,2,3,4,5,6],`${hour(i,7)}:00`,30)]));
 const cmd=(st:State,c:RoutineCommand,now:Date)=>{const n=commitChanges(st,routineLabel(c),draft=>routineAct(draft,c,now));n.receipts.push(crypto.randomUUID());return n;};
 const bytes=(st:State)=>new TextEncoder().encode(JSON.stringify(st)).length,sizes:number[]=[];
 for(let d=0;d<60;d++){
  const day=addDays(MON,d);
  for(let i=0;i<5;i++){const t=local(day,`${hour(i,7)}:00`);s=cmd(s,{kind:'routineStart',routineId:ids[i]},t);s=cmd(s,{kind:'routineFinish'},new Date(t.getTime()+(25+i)*60000));}
  for(let i=0;i<5;i++)s=cmd(s,{kind:'routineLog',routineId:ids[i]},local(day,`${hour(i,8)}:30`));
  sizes.push(bytes(s));
 }
 assert.deepEqual([s.sessions!.length,s.changes.length],[600,900]);
 const growth=sizes.slice(1).map((x,i)=>x-sizes[i]);
 assert.ok(Math.max(...growth)-Math.min(...growth)<=64,`each day adds the same: ${Math.min(...growth)}–${Math.max(...growth)} bytes`);
 assert.ok(sizes.at(-1)!<500_000,`60 days: ${sizes.at(-1)} bytes`);
 if(process.env.SIZE_REPORT)console.log(JSON.stringify({day1:sizes[0],day30:sizes[29],day60:sizes[59],perDay:[Math.min(...growth),Math.max(...growth)]}));
 // One session's change is the same size on day 1 and day 60.
 const logs=s.changes.filter(c=>c.label==='Rutin kaydedildi'&&c.ops.length===1),size=(x:unknown)=>JSON.stringify(x).length;
 assert.ok(size(logs.at(-1))-size(logs[0])<=8);assert.ok(size(logs.at(-1))<600);
});

