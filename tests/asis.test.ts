import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,undo,dayKey,nextMove,openMoves,ensureOrder,propose,type State,type Front} from '../lib/domain';
import {act,type Command} from '../lib/reducer';
import {syncPlans,type CalendarEvent} from '../lib/calendar';
import {describeOp,handNotice} from '../lib/ledger';
import {parseDictation,Result} from '../lib/llm';
import {extractMedia} from '../lib/media';
import {CREDIT_TEXT} from '../lib/provider';

// 5 Ekim: “Olduğu gibi ekle”, “Kaldır”, Harita › Seç and the provider's credit error. No model is called here.
const front=(id:string,title:string,moves:string[],extra:Partial<Front>={}):Front=>({id,title,type:'general',status:'active',moves:moves.map((text,i)=>({id:`${id}-m${i+1}`,text})),where:'',question:'',notes:[],touched:'2026-10-01T10:00:00.000Z',...extra});
function camp(...fronts:Front[]){const s=fresh();s.setup=true;for(const f of fronts)s.fronts[f.id]=f;return s;}
const run=(s:State,c:Omit<Command,'id'>)=>act(s,{id:crypto.randomUUID(),...c} as Command);
const last=(s:State)=>s.changes.at(-1)!;
/** Runs `body` with fetch replaced by a counter that refuses every call. */
async function offline<T>(body:()=>T|Promise<T>):Promise<{value:T;calls:number}>{const original=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('model called');}) as typeof fetch;try{return {value:await body(),calls};}finally{globalThis.fetch=original;}}
function quietLog<T>(body:()=>Promise<T>):Promise<{value:T;logged:string[]}>{const original=console.error,logged:string[]=[];console.error=(...args:unknown[])=>{logged.push(args.map(String).join(' '));};return body().then(value=>({value,logged})).finally(()=>{console.error=original;});}

test('Olduğu gibi ekle: an existing front takes the text as written, at the end of its queue, with no model call',async()=>{
 const {value:s,calls}=await offline(()=>{let s=camp(front('a','Kargo iadesi',['İade formunu doldur.']),front('b','Okuma',[]));
  // Move rules do not apply (“çalış” alone is refused by validMove); spaces are collapsed to one line.
  s=run(s,{kind:'addMove',frontId:'a',title:'Kargo iadesi',text:'  İstatistik\n  çalış '});
  return s;});
 assert.equal(calls,0);
 const a=s.fronts.a,added=a.moves.at(-1)!;
 assert.equal(added.text,'İstatistik çalış');assert.equal(added.userEdited,true);
 assert.deepEqual(openMoves(a).map(m=>m.text),['İade formunu doldur.','İstatistik çalış']);assert.equal(nextMove(a)!.text,'İade formunu doldur.');
 assert.equal(last(s).label,'Hamle eklendi');assert.deepEqual(handNotice(last(s)),{title:'Eklendi.',text:'Kargo iadesi · 2. sırada'});
 assert.equal(describeOp(last(s).ops[0],s.fronts).tag,'YENİ HAMLE');
 // A front with no open move: the new move is the next one.
 const t=run(s,{kind:'addMove',frontId:'b',title:'Okuma',text:'Makaleyi oku.'});
 assert.equal(nextMove(t.fronts.b)!.text,'Makaleyi oku.');assert.equal(handNotice(last(t))!.text,'Okuma · sıradaki hamle');
 // Only the length limit holds.
 assert.throws(()=>run(s,{kind:'addMove',frontId:'a',title:'Kargo iadesi',text:'x'.repeat(121)}),/en fazla 120/);
 assert.equal(run(s,{kind:'addMove',frontId:'a',title:'Kargo iadesi',text:'x'.repeat(120)}).fronts.a.moves.at(-1)!.text.length,120);
 // Undo takes it back.
 assert.deepEqual(undo(s,last(s).id).fronts.a.moves.map(m=>m.text),['İade formunu doldur.']);
});

test('Olduğu gibi ekle: a new front opens as İş with the chosen name; a twin name or a front gone meanwhile never duplicates or blocks',async()=>{
 const id=crypto.randomUUID();
 const {value:s,calls}=await offline(()=>run(camp(front('a','Kargo iadesi',['İade formunu doldur.'])),{kind:'addMove',frontId:id,title:' Dekanlık  imzası ',text:'Dilekçeyi dekanlığa götür.'}));
 assert.equal(calls,0);
 const f=s.fronts[id];assert.ok(f);assert.deepEqual([f.title,f.type,f.status],['Dekanlık imzası','general','active']);
 assert.equal(nextMove(f)!.text,'Dilekçeyi dekanlığa götür.');assert.deepEqual(handNotice(last(s)),{title:'Eklendi.',text:'Dekanlık imzası · yeni cephe'});
 assert.equal(describeOp(last(s).ops.find(o=>o.key==='front:'+id)!,s.fronts).tag,'YENİ CEPHE');
 // The same name again goes to the open front of that name.
 const twin=run(s,{kind:'addMove',frontId:crypto.randomUUID(),title:'dekanlık İMZASI',text:'İmzalı kâğıdı tara.'});
 assert.equal(Object.keys(twin.fronts).length,2);assert.equal(twin.fronts[id].moves.length,2);
 // A queued entry whose front was taken back comes back under the same id and title; without a title it is refused.
 const gone=undo(s,last(s).id);assert.equal(gone.fronts[id],undefined);
 assert.equal(run(gone,{kind:'addMove',frontId:id,title:'Dekanlık imzası',text:'Dilekçeyi dekanlığa götür.'}).fronts[id].title,'Dekanlık imzası');
 assert.throws(()=>run(gone,{kind:'addMove',frontId:id,text:'Dilekçeyi dekanlığa götür.'}),/Cephe bulunamadı/);
 // A front closed meanwhile opens again.
 const closed=run(s,{kind:'status',frontId:id,status:'closed'});assert.equal(run(closed,{kind:'addMove',frontId:id,title:'Dekanlık imzası',text:'Tekrar dene.'}).fronts[id].status,'active');
});

test('Olduğu gibi ekle › Bugünün emrine ekle follows “Cephe ekle / çıkar”',async()=>{
 const {value:s,calls}=await offline(()=>{let s=camp(front('a','Fizik',['Fizik sorularını çöz.']),front('b','Kimya',['Kimya özetini yaz.']));
  s=run(s,{kind:'select',ids:['a']});s=run(s,{kind:'approve'});return s;});
 assert.equal(calls,0);
 const date=dayKey();assert.deepEqual(s.orders[date].slots.map(x=>x.frontId),['a']);
 // Ticked: the active front joins today's approved order at the end; the approval stays.
 const today=run(s,{kind:'addMove',frontId:'b',title:'Kimya',text:'Laboratuvar raporunu teslim et.',today:true});
 assert.deepEqual(today.orders[date].slots.map(x=>x.frontId),['a','b']);assert.ok(today.orders[date].approvedAt);
 assert.equal(today.orders[date].slots[1].text,'Kimya özetini yaz.');assert.equal(handNotice(last(today))!.text,'Kimya · 2. sırada · bugünün emrinde');
 // Not ticked: the stored order stays as it was.
 assert.deepEqual(run(s,{kind:'addMove',frontId:'b',title:'Kimya',text:'Laboratuvar raporunu teslim et.'}).orders[date].slots.map(x=>x.frontId),['a']);
 // A passed camp is not added again; its next move is tomorrow's.
 const passed=run(s,{kind:'complete',frontId:'a'}),again=run(passed,{kind:'addMove',frontId:'a',title:'Fizik',text:'Yeni soru setini çöz.',today:true});
 assert.deepEqual(again.orders[date].slots.map(x=>[x.frontId,!!x.doneAt]),[['a',true]]);
 // A held project does not join (and the queued entry is not refused).
 let held=camp(front('a','Fizik',['Fizik sorularını çöz.']),front('t','Tez',['Tez taslağını aç.'],{type:'lane',status:'held'}));held=run(held,{kind:'select',ids:['a']});
 assert.deepEqual(run(held,{kind:'addMove',frontId:'t',title:'Tez',text:'Bölüm 2’yi yaz.',today:true}).orders[date].slots.map(x=>x.frontId),['a']);
 // While today's order is only proposed, the new move enters the proposal by itself.
 const proposed=run(camp(front('a','Fizik',['Fizik sorularını çöz.'])),{kind:'addMove',frontId:crypto.randomUUID(),title:'Kargo',text:'Paketi PTT’ye götür.'});
 assert.equal(proposed.orders[date],undefined);assert.equal(propose(proposed,date).slots.length,2);
});

test('Kaldır: the next, a middle and the last move leave the queue, the next moves up, and each is taken back',()=>{
 let s=camp(front('a','Kargo iadesi',['Formu doldur.','Paketi hazırla.','PTT’ye götür.']),front('b','Kimya',['Kimya özetini yaz.']));
 s=run(s,{kind:'approve'});const date=dayKey(),slot=()=>s.orders[date].slots.find(x=>x.frontId==='a');
 assert.equal(slot()!.text,'Formu doldur.');
 // The next move: the slot takes the following one.
 const next=run(s,{kind:'removeMove',frontId:'a',moveId:'a-m1'});
 assert.deepEqual(openMoves(next.fronts.a).map(m=>m.text),['Paketi hazırla.','PTT’ye götür.']);
 assert.equal(next.orders[date].slots.find(x=>x.frontId==='a')!.text,'Paketi hazırla.');assert.ok(next.orders[date].approvedAt);
 assert.ok(next.fronts.a.moves.find(m=>m.id==='a-m1')!.removedAt,'kept on record');assert.equal(next.fronts.a.moves.length,3);
 assert.equal(last(next).label,'Hamle kaldırıldı');assert.deepEqual(handNotice(last(next)),{title:'Kaldırıldı.',text:'Formu doldur.'});
 const lines=last(next).ops.map(o=>describeOp(o,next.fronts));assert.deepEqual([lines[0].tag,lines[0].text],['KALDIRILDI','Kargo iadesi: Formu doldur.']);assert.ok(lines.slice(1).every(l=>l.quiet));
 assert.equal(undo(next,last(next).id).orders[date].slots.find(x=>x.frontId==='a')!.text,'Formu doldur.');
 // A middle move: the queue closes up, the slot stays.
 const middle=run(s,{kind:'removeMove',frontId:'a',moveId:'a-m2'});
 assert.deepEqual(openMoves(middle.fronts.a).map(m=>m.text),['Formu doldur.','PTT’ye götür.']);assert.equal(middle.orders[date].slots.find(x=>x.frontId==='a')!.text,'Formu doldur.');
 assert.deepEqual(openMoves(undo(middle,last(middle).id).fronts.a).map(m=>m.text),['Formu doldur.','Paketi hazırla.','PTT’ye götür.']);
 // The last move in the queue.
 const end=run(s,{kind:'removeMove',frontId:'a',moveId:'a-m3'});assert.deepEqual(openMoves(end.fronts.a).map(m=>m.text),['Formu doldur.','Paketi hazırla.']);
 // The only move left: the camp leaves today's route; undo brings both back.
 const only=run(s,{kind:'removeMove',frontId:'b',moveId:'b-m1'});
 assert.equal(nextMove(only.fronts.b),undefined);assert.deepEqual(only.orders[date].slots.map(x=>x.frontId),['a']);
 const lineB=last(only).ops.map(o=>describeOp(o,only.fronts));assert.ok(lineB.some(l=>l.text==='Kimya çıkarıldı.'));
 assert.deepEqual(undo(only,last(only).id).orders[date].slots.map(x=>x.frontId).sort(),['a','b']);
 // A removed or done move cannot be removed (or completed) again.
 assert.throws(()=>run(next,{kind:'removeMove',frontId:'a',moveId:'a-m1'}),/bitmiş ya da kaldırılmış/);
 const done=run(s,{kind:'complete',frontId:'a'});assert.throws(()=>run(done,{kind:'removeMove',frontId:'a',moveId:'a-m1'}),/bitmiş ya da kaldırılmış/);
});

test('Kaldır keeps a preparation removed when the plan is made again',()=>{
 const date=dayKey(),plus=(n:number)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const e:CalendarEvent={id:'e1',title:'Fizik vizesi',kind:'exam',frontId:'f',date:plus(5),time:'10:00',endTime:null,location:'',bring:[],weekly:false,prepDays:null,documents:[],institution:'',program:'',portal:''};
 let s=camp(front('f','Fizik',[]));s.events={e1:e};syncPlans(s,date);
 const prep=openMoves(s.fronts.f);assert.ok(prep.length>1);
 s=run(s,{kind:'removeMove',frontId:'f',moveId:prep[0].id});syncPlans(s,date);
 assert.deepEqual(openMoves(s.fronts.f).map(m=>m.id),prep.slice(1).map(m=>m.id));assert.equal(s.fronts.f.moves.filter(m=>m.id===prep[0].id).length,1);
});

test('Harita › Seç: the chosen fronts close in one change and one undo brings them all back',()=>{
 let s=camp(front('a','Fizik',['Fizik sorularını çöz.']),front('b','Kimya',['Kimya özetini yaz.']),front('c','Kargo',['Paketi götür.']),front('d','Okuma',['Makaleyi oku.']));
 s=run(s,{kind:'approve'});s=run(s,{kind:'complete',frontId:'c'});const date=dayKey(),before=structuredClone({fronts:s.fronts,orders:s.orders}),count=s.changes.length;
 const closed=run(s,{kind:'closeFronts',ids:['a','b','c']});
 assert.equal(closed.changes.length,count+1);assert.equal(last(closed).label,'3 cephe kapatıldı');
 assert.deepEqual(['a','b','c','d'].map(id=>closed.fronts[id].status),['closed','closed','closed','active']);
 // Open camps leave today's route; the passed one stays.
 assert.deepEqual(closed.orders[date].slots.map(x=>[x.frontId,!!x.doneAt]).sort(),[['c',true],['d',false]]);assert.ok(closed.orders[date].approvedAt);
 assert.deepEqual(handNotice(last(closed)),{title:'3 cephe kapatıldı.',text:'Fizik, Kimya, Kargo'});
 const back=undo(closed,last(closed).id);
 assert.deepEqual({fronts:back.fronts,orders:back.orders},before);
 assert.throws(()=>run(s,{kind:'closeFronts',ids:[]}),/seç/);
});

test('All of it is taken back: add, remove and close undone in turn restore the start',()=>{
 let s=camp(front('a','Fizik',['Fizik sorularını çöz.','Formül kartını yaz.']),front('b','Kimya',['Kimya özetini yaz.']));
 s=run(s,{kind:'approve'});const start=structuredClone({fronts:s.fronts,orders:s.orders}),id=crypto.randomUUID();
 s=run(s,{kind:'addMove',frontId:id,title:'Kargo',text:'Paketi PTT’ye götür.',today:true});
 s=run(s,{kind:'addMove',frontId:'b',title:'Kimya',text:'Laboratuvar raporunu yaz.'});
 s=run(s,{kind:'removeMove',frontId:'a',moveId:'a-m1'});
 s=run(s,{kind:'closeFronts',ids:['b',id]});
 assert.deepEqual(ensureOrder(s).slots.map(x=>x.frontId),['a']);
 for(const c of [...s.changes].reverse().slice(0,4))s=undo(s,c.id);
 assert.deepEqual({fronts:s.fronts,orders:s.orders},start);
});

test('Out of credit says so; other provider errors keep their text and log the body',async()=>{
 const original=globalThis.fetch,config={provider:'anthropic' as const,key:'fixture',model:'fixture'};
 const reply=(status:number,body:string)=>{globalThis.fetch=(async()=>new Response(body,{status})) as typeof fetch;};
 try{
  reply(402,JSON.stringify({type:'error',error:{type:'billing_error',message:'Payment required'}}));
  assert.equal(CREDIT_TEXT,'Yapay zekâ kredisi bitti. Metnin saklandı; kredi yükleyince tekrar dene.');
  const paid=await quietLog(()=>parseDictation('Kargo',fresh(),null,config).then(()=>'',e=>String((e as Error).message)));assert.equal(paid.value,CREDIT_TEXT);assert.deepEqual(paid.logged,[]);
  reply(400,JSON.stringify({type:'error',error:{type:'invalid_request_error',message:'Your credit balance is too low to access the Anthropic API.'}}));
  assert.equal((await quietLog(()=>parseDictation('Kargo',fresh(),null,config).then(()=>'',e=>String((e as Error).message)))).value,CREDIT_TEXT);
  reply(400,'{"error":{"message":"Hesap bakiyesi yetersiz"}}');
  assert.equal((await quietLog(()=>parseDictation('Kargo',fresh(),null,{...config,provider:'gemini'}).then(()=>'',e=>String((e as Error).message)))).value,CREDIT_TEXT);
  // A quota limit stays a limit even when it mentions billing; the body goes to the log, not to the user.
  reply(429,'{"error":{"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota, please check your plan and billing details."}}');
  const quota=await quietLog(()=>parseDictation('Kargo',fresh(),null,{...config,provider:'gemini'}).then(()=>'',e=>String((e as Error).message)));
  assert.match(quota.value,/kullanım sınırına/);assert.equal(quota.logged.length,1);assert.match(quota.logged[0],/Gemini 429: .*RESOURCE_EXHAUSTED/);
  reply(500,'upstream exploded');
  const broken=await quietLog(()=>parseDictation('Kargo',fresh(),null,config).then(()=>'',e=>String((e as Error).message)));
  assert.match(broken.value,/işlenemedi/);assert.doesNotMatch(broken.value,/exploded/);assert.deepEqual(broken.logged,['Anthropic 500: upstream exploded']);
  // Transcription says it with the file kept on the device.
  reply(402,'{}');
  assert.equal((await quietLog(()=>extractMedia(new Uint8Array([1]),'image/png',{ANTHROPIC_API_KEY:'fixture'}).then(()=>'',e=>String((e as Error).message)))).value,'Yapay zekâ kredisi bitti. Dosyan cihazında saklı; kredi yükleyince tekrar dene.');
 }finally{globalThis.fetch=original;}
});

test('The empty values of the newer schema fields read as null, as before',()=>{
 const p=Result.parse({items:[{id:null,title:'Yoga',type:'general',complete:false,completedMoveId:null,moves:['Yoga yap.'],where:null,question:null,prerequisite:null,alt:'none'}],question:null,summary:'',
  routines:[{id:'',title:'Yüz yogası',count:4,time:'',minutes:0,travel:0,ownWords:'',steps:[],alt:''},{id:'r1',title:'Mayalama',count:1,time:'08:00',minutes:25,travel:20,ownWords:'Ekmek güzel',steps:[{title:'Bekle',minutes:0,wait:true}],alt:'move'}],
  sessions:[{routineId:'',title:'Yüz yogası',dayText:'',end:'',minutes:0,skip:false,done:true}]});
 assert.equal(p.items[0].alt,null);
 assert.deepEqual(p.routines![0],{id:null,title:'Yüz yogası',count:4,time:null,minutes:null,travel:null,ownWords:null,steps:null,alt:null});
 assert.deepEqual(p.routines![1],{id:'r1',title:'Mayalama',count:1,time:'08:00',minutes:25,travel:20,ownWords:'Ekmek güzel',steps:[{title:'Bekle',minutes:null,wait:true}],alt:'move'});
 assert.deepEqual(p.sessions![0],{routineId:null,title:'Yüz yogası',dayText:null,end:null,minutes:null,skip:false,done:true});
 // Older outputs with null still parse.
 assert.equal(Result.parse({items:[],question:null,summary:'',routines:[{id:null,title:'Gym',count:3,time:null,minutes:null,travel:null,ownWords:null,steps:null,alt:null}]}).routines![0].steps,null);
});
