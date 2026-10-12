import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,undo,dayKey,nextMove,openMoves,ensureOrder,propose,type State,type Front} from '../lib/domain';
import {act,applyParsed,applySuggestion,needsModel,type Command} from '../lib/reducer';
import {syncPlans,type CalendarEvent} from '../lib/calendar';
import {describeOp,handNotice} from '../lib/ledger';
import {logbook} from '../lib/logbook';
import {placedGone} from '../lib/kinds';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import AtlasOrder,{RouteHead} from '../app/atlas-order';
import type {ReactElement} from 'react';
import {StatusCard} from '../app/status';
import {DICTATION_TOOL,jsonSchema,parseDictation,Result,schema,type LlmConfig,type Parsed} from '../lib/llm';
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
 let s=camp(front('a','Fizik',['Fizik sorularını çöz.']),front('b','Kimya',['Kimya özetini yaz.']),front('c','Kargo',['Paketi götür.','Kargo takibini yap.']),front('d','Okuma',['Makaleyi oku.']));
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
  assert.equal(broken.value,'Dikte şu anda işlenemedi (Anthropic 500). Metnin kaydedildi; tekrar deneyebilirsin.');assert.deepEqual(broken.logged,['Anthropic 500: upstream exploded']);
  // Transcription says it with the file kept on the device.
  reply(402,'{}');
  assert.equal((await quietLog(()=>extractMedia(new Uint8Array([1]),'image/png',{ANTHROPIC_API_KEY:'fixture'}).then(()=>'',e=>String((e as Error).message)))).value,'Yapay zekâ kredisi bitti. Dosyan cihazında saklı; kredi yükleyince tekrar dene.');
 }finally{globalThis.fetch=original;}
});

// User report (6 Ekim): every dictation read “Dikte şu anda işlenemedi”. The Sites log had, ten times in three hours,
// Anthropic 400 invalid_request_error “The compiled grammar is too large, which would cause performance issues.”: the
// strict json_schema is compiled to a grammar whose size is limited beyond the 20 strict tool / 24 optional / 16 union limits.
const dictated={items:[{id:null,title:'Kargo iadesi',type:'general',complete:false,completedMoveId:null,moves:['İade formunu doldur.'],where:null,question:null,prerequisite:null,alt:'none'}],question:null,summary:'1 cephe ve 1 hamle önerildi.',events:[],prepDefaults:[],ideas:[],laneUpdates:[],routines:[],sessions:[]};
const sonnet:LlmConfig={provider:'anthropic',key:'fixture',model:'claude-sonnet-5'};
// claude-sonnet-5 thinks by default (adaptive), so a thinking block comes before the call.
const toolCall=(input:unknown,stop='tool_use')=>Response.json({content:[{type:'thinking',thinking:'',signature:'x'},{type:'tool_use',id:'t',name:DICTATION_TOOL,input}],stop_reason:stop});
const textAnswer=(text:string)=>Response.json({content:[{type:'text',text}],stop_reason:'end_turn'});
/** parseDictation against answers given in turn (the last one repeats): the request bodies, the result or error text, the log. */
async function dictate(answers:(()=>Response)[],config=sonnet,s=fresh()){
 const original=globalThis.fetch,sent:Record<string,unknown>[]=[];
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{sent.push(JSON.parse(String(init?.body)));return answers[Math.min(sent.length,answers.length)-1]();}) as typeof fetch;
 try{const r=await quietLog(()=>parseDictation('Kargo iadesi için formu doldur',s,null,config).then(p=>p as Parsed|string,e=>String((e as Error).message)));return {sent,result:r.value,logged:r.logged};}
 finally{globalThis.fetch=original;}
}
const retried=(body:Record<string,unknown>)=>(JSON.parse((body.messages as {content:string}[])[0].content) as {validationError:string}).validationError;

test('Anthropic: the dictation schema goes as a forced non-strict tool, not as a compiled grammar',async()=>{
 let r=await dictate([()=>toolCall(dictated)]);
 assert.equal(r.sent.length,1);assert.deepEqual((r.result as Parsed).items.map(i=>[i.id,i.title,i.moves]),[[null,'Kargo iadesi',['İade formunu doldur.']]]);
 const body=r.sent[0] as {output_config?:unknown;tools:{name:string;strict?:boolean;input_schema:unknown}[];tool_choice:unknown;system:string};
 // Nothing is compiled: no output_config, no strict tool. claude-sonnet-5 takes a forced tool.
 assert.equal(body.output_config,undefined);assert.deepEqual(body.tools.map(t=>[t.name,t.strict]),[[DICTATION_TOOL,undefined]]);
 assert.deepEqual(body.tools[0].input_schema,jsonSchema(schema));assert.deepEqual(body.tool_choice,{type:'tool',name:DICTATION_TOOL,disable_parallel_tool_use:true});assert.match(body.system,new RegExp(DICTATION_TOOL));
 // A model that refuses a forced tool (Sonnet 5.5, Opus 5.5, Fable 5.1) is asked again with auto, and so from then on.
 const forcedNo=()=>new Response(JSON.stringify({type:'error',error:{type:'invalid_request_error',message:'tool_choice: type "tool" and "any" are not supported for this model.'}}),{status:400});
 const newer={...sonnet,model:'claude-test-'+crypto.randomUUID()},kinds=(x:typeof r)=>x.sent.map(b=>(b.tool_choice as {type:string}).type);
 r=await dictate([forcedNo,()=>toolCall(dictated)],newer);assert.deepEqual(kinds(r),['tool','auto']);assert.equal((r.result as Parsed).items.length,1);assert.deepEqual(r.logged,[]);
 r=await dictate([()=>toolCall(dictated)],newer);assert.deepEqual(kinds(r),['auto']);
 r=await dictate([()=>toolCall(dictated)]);assert.deepEqual(kinds(r),['tool']);
 // Two dictations in flight before the first refusal both fall back (the choice is made once per attempt).
 const racing={...sonnet,model:'claude-test-'+crypto.randomUUID()},original=globalThis.fetch,choices:string[]=[];
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{const type=(JSON.parse(String(init?.body)) as {tool_choice:{type:string}}).tool_choice.type;choices.push(type);if(type==='auto')return toolCall(dictated);await new Promise(done=>setTimeout(done,choices.length*20));return forcedNo();}) as typeof fetch;
 try{const both=await Promise.all([parseDictation('a',fresh(),null,racing),parseDictation('b',fresh(),null,racing)]);assert.deepEqual(both.map(p=>p.items.length),[1,1]);assert.deepEqual(choices.sort(),['auto','auto','tool','tool']);}
 finally{globalThis.fetch=original;}
 // No answer in 45 seconds, or no connection: said in Turkish, the cause in the log, not retried.
 r=await dictate([()=>{throw new DOMException('The operation was aborted due to timeout','TimeoutError');}]);
 assert.equal(r.result,'Yapay zekâ 45 saniyede yanıt vermedi (Anthropic). Metnin kaydedildi; tekrar deneyebilirsin.');assert.equal(r.sent.length,1);assert.match(r.logged.join(' '),/Anthropic isteği: TimeoutError/);
 r=await dictate([()=>{throw new TypeError('fetch failed');}]);assert.equal(r.result,'Yapay zekâya ulaşılamadı (Anthropic). Metnin kaydedildi; tekrar deneyebilirsin.');
 // The production refusal itself: named with provider and status on the card, the body only in the log, not retried.
 const grammar=JSON.stringify({type:'error',error:{type:'invalid_request_error',message:'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.'}});
 r=await dictate([()=>new Response(grammar,{status:400})]);
 assert.equal(r.result,'Dikte şu anda işlenemedi (Anthropic 400). Metnin kaydedildi; tekrar deneyebilirsin.');assert.deepEqual(r.logged,['Anthropic 400: '+grammar]);assert.equal(r.sent.length,1);
 // Gemini keeps its response schema.
 r=await dictate([()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(dictated)}]}}]})],{...sonnet,provider:'gemini',model:'gemini-2.5-flash'});
 assert.deepEqual((r.sent[0] as {generationConfig?:{responseSchema?:unknown}}).generationConfig?.responseSchema,schema);assert.equal((r.result as Parsed).items.length,1);
});

test('Without strict mode: what is left out reads as not said; a cut-off, empty or wrapped answer is asked again',async()=>{
 // Left out, null for a list, a number or yes/no as text, a list as JSON text, an extra field: read as strict mode had them.
 let r=await dictate([()=>toolCall({items:[{title:'Kargo iadesi',type:'general',moves:null,complete:'false',prerequisite:'null',note:'ek'}],summary:'1 hamle önerildi.',routines:JSON.stringify([{title:'Yüz yogası',count:'4'}]),confidence:0.9})]);
 assert.equal(r.sent.length,1);const p=r.result as Parsed;
 assert.deepEqual(p.items,[{prerequisite:null,id:null,title:'Kargo iadesi',type:'general',complete:false,completedMoveId:null,moves:[],where:null,question:null,alt:null}]);
 assert.deepEqual(p.routines?.map(x=>[x.title,x.count,x.time,x.steps]),[['Yüz yogası',4,null,null]]);assert.deepEqual([p.question,p.events,p.sessions],[null,[],[]]);
 // A cut-off or refused answer is no dictation even when what came back would pass: asked again with the reason, then said.
 for(const stop of ['max_tokens','model_context_window_exceeded','refusal']){
  r=await dictate([()=>toolCall(dictated,stop)]);
  assert.equal(r.sent.length,2);assert.match(retried(r.sent[1]),new RegExp(stop));assert.match(String(r.result),/güvenilir biçimde çözümlenemedi/);assert.match(r.logged.join(' '),new RegExp(`Yanıt tamamlanmadı \\(${stop}\\)`));
 }
 // An empty or wrapped call has none of the schema's root fields: asked again, and the next answer is used.
 for(const bad of [{},{dictation:dictated},JSON.stringify(dictated).slice(0,40)]){r=await dictate([()=>toolCall(bad),()=>toolCall(dictated)]);assert.equal(r.sent.length,2,JSON.stringify(bad));assert.match(retried(r.sent[1]),/şemanın alanları/);assert.equal((r.result as Parsed).items[0].title,'Kargo iadesi');}
 // A root with only some of its fields is an answer: ideas alone (an idea-only dictation), or items without a summary.
 r=await dictate([()=>toolCall({ideas:[{text:'Belki mikrobiyom verisine ikinci bir yöntem denenir.',kind:'idea',laneId:null}],summary:'1 fikir kaydedildi.'})]);
 assert.equal(r.sent.length,1);assert.deepEqual([(r.result as Parsed).items,(r.result as Parsed).ideas?.length],[[],1]);
 r=await dictate([()=>toolCall({items:dictated.items})]);assert.equal(r.sent.length,1);assert.equal((r.result as Parsed).summary,'');
 // The whole input as JSON text is read.
 r=await dictate([()=>toolCall(JSON.stringify(dictated))]);assert.equal(r.sent.length,1);assert.equal((r.result as Parsed).items[0].title,'Kargo iadesi');
 // Text: fenced or with words around it is read; no JSON at all is asked again, saying the tool was not called.
 r=await dictate([()=>textAnswer('Kaydediyorum:\n```json\n'+JSON.stringify(dictated)+'\n```\nTamam.')]);assert.equal(r.sent.length,1);assert.equal((r.result as Parsed).items[0].title,'Kargo iadesi');
 r=await dictate([()=>textAnswer('Tamam.')]);assert.equal(r.sent.length,2);assert.match(retried(r.sent[1]),/aracını çağırmadın/);assert.match(String(r.result),/güvenilir biçimde/);
});

test('A dated item is never filled in: a partial update is asked again, so the stored date and place stay',async()=>{
 const s=fresh();s.events={lab:{id:'lab',title:'Fizik labı',kind:'lab',frontId:null,date:'2026-10-14',time:'14:00',endTime:'17:00',location:'B201',bring:['Önlük'],weekly:false,prepDays:null,documents:[],institution:'',program:'',portal:''}};
 const full={id:'lab',title:'Fizik labı',kind:'lab',frontTitle:null,dateText:'2026-10-14',time:'13:00',endTime:'17:00',location:'B201',bring:['Önlük'],weekly:false,prepDays:null,documents:[],institution:'',program:'',portal:''};
 // Only what changed, or the stored shape (date, frontId): neither reaches the reducer, which would rebuild the item from it.
 for(const partial of [{id:'lab',title:'Fizik labı',kind:'lab',time:'13:00'},{...s.events.lab,time:'13:00'}]){
  const r=await dictate([()=>toolCall({...dictated,items:[],events:[partial]}),()=>toolCall({...dictated,items:[],events:[full]})],sonnet,s);
  assert.equal(r.sent.length,2);assert.match(retried(r.sent[1]),/events/);assert.deepEqual((r.result as Parsed).events?.map(e=>[e.time,e.location,e.bring]),[['13:00','B201',['Önlük']]]);
 }
 // A whole item with the stored shape's extra keys, or yes/no and numbers as text, is read in one call (nothing is filled).
 let r=await dictate([()=>toolCall({...dictated,items:[],events:[{...full,date:'2026-10-14',frontId:null,weekly:'false',prepDays:'3'}],prepDefaults:[{kind:'exam',days:'14'}]})],sonnet,s);
 assert.equal(r.sent.length,1);assert.deepEqual((r.result as Parsed).events?.map(e=>[e.time,e.weekly,e.prepDays,e.location]),[['13:00',false,3,'B201']]);assert.deepEqual((r.result as Parsed).prepDefaults,[{kind:'exam',days:14}]);
 // A preparation default left without its days is not read as 0 days.
 r=await dictate([()=>toolCall({...dictated,prepDefaults:[{kind:'exam'}]}),()=>toolCall({...dictated,prepDefaults:[{kind:'exam',days:5}]})]);
 assert.equal(r.sent.length,2);assert.deepEqual((r.result as Parsed).prepDefaults,[{kind:'exam',days:5}]);
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

// Second round (5 Ekim): Bitti never waits on the model, the empty day keeps its map link, and Codex's three findings.
const tomorrow=()=>new Date(Date.parse(dayKey()+'T12:00:00Z')+86400000).toISOString().slice(0,10);

test('Bitti on the last move: an İş front closes in the same change, Ders and Başvuru stay open, no model call',async()=>{
 const {value,calls}=await offline(()=>{let s=camp(front('kargo','Kargo iadesi',['PTT’ye götür.']),front('fizik','Fizik',['Vize konularını listele.'],{type:'course'}),front('era','Erasmus+',['Referans mailini gönder.'],{type:'application'}),front('imza','Dekanlık imzası',['Dilekçeyi yaz.','Dilekçeyi götür.']));
  s=run(s,{kind:'approve'});const out:Record<string,State>={};for(const id of ['kargo','fizik','era','imza'])out[id]=run(s,{kind:'complete',frontId:id});return {s,out};});
 assert.equal(calls,0);const {s,out}=value,date=dayKey();
 // İş: the move is done, the front closed, the camp passed; one change, one undo.
 const kargo=out.kargo,c=last(kargo);
 assert.ok(kargo.fronts.kargo.moves[0].doneAt);assert.equal(kargo.fronts.kargo.status,'closed');assert.ok(kargo.fronts.kargo.closedAt);
 assert.ok(kargo.orders[date].slots.find(x=>x.frontId==='kargo')!.doneAt);assert.equal(c.label,'Hamle tamamlandı; cephe kapandı');
 assert.deepEqual(handNotice(c),{title:'Kargo iadesi tamamlandı, cephe kapandı.',text:''});
 assert.deepEqual([describeOp(c.ops.find(o=>o.key==='front:kargo')!,kargo.fronts).tag,describeOp(c.ops.find(o=>o.key==='front:kargo')!,kargo.fronts).text],['HAMLE BİTTİ','Kargo iadesi: PTT’ye götür. · cephe kapandı']);
 const back=undo(kargo,c.id);assert.equal(back.fronts.kargo.status,'active');assert.equal(back.fronts.kargo.closedAt,undefined);assert.equal(nextMove(back.fronts.kargo)!.text,'PTT’ye götür.');
 // Ders and Başvuru: open, with no next move; the card offers the two ways on; tomorrow's proposal leaves them out.
 for(const id of ['fizik','era']){const t=out[id];assert.equal(t.fronts[id].status,'active');assert.equal(nextMove(t.fronts[id]),undefined);assert.equal(last(t).label,'Hamle tamamlandı');
  assert.deepEqual(handNotice(last(t)),{title:'Hamle tamamlandı.',text:`${t.fronts[id].title}: sıradaki hamle yok.`,next:id});
  assert.ok(t.orders[date].slots.find(x=>x.frontId===id)!.doneAt,'today keeps the passed camp');assert.ok(!propose(t,tomorrow()).slots.some(x=>x.frontId===id));}
 // A front with more moves: the next one moves up, the usual card.
 assert.equal(nextMove(out.imza.fronts.imza)!.text,'Dilekçeyi götür.');assert.equal(out.imza.fronts.imza.status,'active');assert.equal(handNotice(last(out.imza)),null);
 // Projects do not change: Atla on a project's last move keeps it open, the usual card.
 const lane=run(camp(front('tez','Tez',['Bölüm 2’yi yaz.'],{type:'lane'})),{kind:'complete',frontId:'tez'});
 assert.equal(lane.fronts.tez.status,'active');assert.equal(handNotice(last(lane)),null);
 assert.equal(s.fronts.kargo.status,'active');
});

test('A completion asks the model only for a note; Bitti alone never does',()=>{
 assert.equal(needsModel({kind:'complete'}),false);assert.equal(needsModel({kind:'complete',skip:true}),false);assert.equal(needsModel({kind:'complete',skip:false,text:'  '}),false);
 assert.equal(needsModel({kind:'complete',text:'Yöntem bölümünde kaldım.'}),true,'a project’s “Nerede kaldın?” note');assert.equal(needsModel({kind:'complete',skip:true,text:'not'}),false);
 // An older Bitti row stored with the server's placeholder and resent later (Tekrar dene, recovery) has no note either.
 assert.equal(needsModel({kind:'complete',text:'Hamleyi tamamladım.'}),false);
 assert.equal(needsModel({kind:'dictate',text:'Kargo'}),true);for(const kind of ['addMove','removeMove','closeFronts','suggest','approve'])assert.equal(needsModel({kind}),false);
});

test('Berthier önersin adds the model’s moves to that front only, on a tap',()=>{
 const s=run(camp(front('fizik','Fizik',['Vize konularını listele.'],{type:'course'}),front('kim','Kimya',['Özet yaz.'])),{kind:'complete',frontId:'fizik'});
 const p:Parsed={items:[{id:'fizik',title:'Fizik',type:'course',complete:false,completedMoveId:null,moves:['Geçen yılın vize sorularını çöz.','Vize konularını listele.'],where:null,question:null,prerequisite:null,alt:null},{id:'kim',title:'Kimya',type:'general',complete:false,completedMoveId:null,moves:['Başka bir şey.'],where:null,question:null,prerequisite:null,alt:null}],question:null,summary:''};
 const t=applySuggestion(s,'fizik',p);
 // The move just finished is not brought back; nor is one taken out with Kaldır.
 assert.deepEqual(openMoves(t.fronts.fizik).map(m=>m.text),['Geçen yılın vize sorularını çöz.']);assert.deepEqual(t.fronts.kim,s.fronts.kim);
 const withCard=run(s,{kind:'addMove',frontId:'fizik',title:'Fizik',text:'Formül kartını yaz.'}),removed=run(withCard,{kind:'removeMove',frontId:'fizik',moveId:openMoves(withCard.fronts.fizik)[0].id});
 assert.throws(()=>applySuggestion(removed,'fizik',{...p,items:[{...p.items[0],moves:['Formül kartını yaz.','Vize konularını listele.']}]}),/yeni bir hamle bulamadı/);
 assert.equal(last(t).label,'Berthier hamle önerdi');assert.deepEqual(handNotice(last(t)),{title:'Berthier önerdi.',text:'Fizik: Geçen yılın vize sorularını çöz.'});
 assert.throws(()=>applySuggestion(s,'fizik',{...p,question:'Hangi ders?'}),/yeni bir hamle bulamadı/);assert.throws(()=>applySuggestion(s,'fizik',{...p,items:[]}),/yeni bir hamle bulamadı/);
 assert.equal(undo(t,last(t).id).fronts.fizik.moves.length,1);
});

test('Karargâh keeps “Haritada aç” on a day without an order; the card offers both ways when no move is left',()=>{
 const s=camp(front('fizik','Fizik',[],{type:'course'}),front('kargo','Kargo iadesi',['PTT’ye götür.']));
 const props={state:s,busy:false,online:true,why:'',open:()=>{},complete:()=>{},edit:()=>{},select:()=>{},action:async()=>true,say:()=>{}};
 const empty=renderToStaticMarkup(createElement(AtlasOrder,{...props,order:{date:dayKey(),slots:[]}}));
 assert.match(empty,/Bugün açık emir yok\./);assert.match(empty,/ROTA · 0 CEPHE/);assert.match(empty,/HARİTADA AÇ/);
 const full=renderToStaticMarkup(createElement(AtlasOrder,{...props,order:ensureOrder(s)}));assert.match(full,/ROTA · 1 CEPHE/);assert.match(full,/HARİTADA AÇ/);
 // A prerequisite that came without its reason (no strict mode since 6 Ekim) keeps the route's own reason line.
 const bare=camp(front('kargo','Kargo iadesi',['PTT’ye götür.'])),order=ensureOrder(bare);bare.fronts.kargo.moves[0].prerequisiteReason='';
 assert.ok(order.slots[0].reason);assert.ok(renderToStaticMarkup(createElement(AtlasOrder,{...props,state:bare,order})).includes(order.slots[0].reason));
 // The head's button opens the map (the same RouteHead AtlasOrder renders above).
 let opened='';const head=RouteHead({count:0,approved:false,open:id=>{opened=id;}}) as ReactElement<{children:ReactElement<{onClick?:()=>void}>[]}>;
 head.props.children.find(c=>typeof c.props.onClick==='function')!.props.onClick!();assert.equal(opened,'map');
 const nop=()=>{},card=renderToStaticMarkup(createElement(StatusCard,{notice:{kind:'done',id:1,title:'Hamle tamamlandı.',text:'Fizik: sıradaki hamle yok.',changeId:'c1',next:'fizik'},error:'',online:true,processing:false,queued:0,busy:false,see:nop,undo:nop,retry:nop,dismiss:nop,clearError:nop,reply:nop,write:nop,running:null,reminder:null,finish:nop,fixEnd:nop,fix:nop,start:nop,skip:nop,hide:nop,alt:nop,keep:nop,suggest:nop,asIs:nop}));
 for(const label of ['Fizik: sıradaki hamle yok.','Berthier önersin','Olduğu gibi ekle','Geri al'])assert.ok(card.includes(label),label);
});

test('Codex review: a queued “Bugünün emrine ekle” keeps its day; removals count; a removed placement cannot change kind',()=>{
 let s=camp(front('a','Fizik',['Fizik sorularını çöz.']),front('b','Kimya',['Kimya özetini yaz.']));s=run(s,{kind:'select',ids:['a']});s=run(s,{kind:'approve'});const date=dayKey();
 assert.deepEqual(run(s,{kind:'addMove',frontId:'b',title:'Kimya',text:'Raporu yaz.',today:true,orderDate:'2000-01-01'}).orders[date].slots.map(x=>x.frontId),['a'],'a past day’s choice does not reach today’s order');
 assert.deepEqual(run(s,{kind:'addMove',frontId:'b',title:'Kimya',text:'Raporu yaz.',today:true,orderDate:date}).orders[date].slots.map(x=>x.frontId),['a','b']);
 s.expedition={startedAt:date};const removed=run(run(s,{kind:'removeMove',frontId:'a',moveId:'a-m1'}),{kind:'edit',frontId:'b',text:'Kimya özetini bitir.'});
 const metric=logbook(removed,date).metrics.find(m=>m.title==='Elle düzenleme ve ayar değişikliği')!;assert.match(metric.value,/^3 · /,'one selection, one edit and one removal');assert.match(metric.note,/1 emir değişikliği, 1 hamle düzenlemesi, 1 hamle kaldırma/);
 assert.equal(placedGone(removed,'move:a:a-m1'),'KALDIRILDI');assert.equal(placedGone(run(s,{kind:'complete',frontId:'a'}),'move:a:a-m1'),'BİTTİ');assert.equal(placedGone(s,'move:a:a-m1'),null);assert.equal(placedGone(s,'idea:x'),null);
});

test('Review round: a closed İş front that takes a new move opens again; an already closed one is not relabelled',()=>{
 let s=camp(front('kargo','Kargo iadesi',['PTT’ye götür.']),front('tez','Tez',['Bölüm 2’yi yaz.'],{type:'lane'}));
 s=run(s,{kind:'complete',frontId:'kargo'});assert.equal(s.fronts.kargo.status,'closed');
 // Dictation about it again: the move lands on an open front, in today's proposal; one undo closes it again.
 const told=applyParsed(s,{items:[{id:'kargo',title:'Kargo iadesi',type:'general',complete:false,completedMoveId:null,moves:['Kargo şirketini ara.'],where:null,question:null,prerequisite:null,alt:null}],question:null,summary:'İşlendi'},'Kargo geri döndü, kargo şirketini ara.');
 assert.equal(told.fronts.kargo.status,'active');assert.equal(told.fronts.kargo.closedAt,undefined);assert.ok(propose(told,dayKey()).slots.some(x=>x.frontId==='kargo'));
 assert.equal(describeOp(last(told).ops.find(o=>o.key==='front:kargo')!,told.fronts).text,'Kargo iadesi: Kargo şirketini ara. · cephe yeniden açıldı');
 assert.equal(undo(told,last(told).id).fronts.kargo.status,'closed');
 // Düzenle on the closed front's page (no next move) opens it too.
 const edited=run(s,{kind:'edit',frontId:'kargo',text:'Dilekçenin kopyasını al.'});assert.equal(edited.fronts.kargo.status,'active');assert.equal(nextMove(edited.fronts.kargo)!.text,'Dilekçenin kopyasını al.');
 // A closed project spoken of again stays the user's call.
 const lane=applyParsed(run(s,{kind:'status',frontId:'tez',status:'closed'}),{items:[{id:'tez',title:'Tez',type:'lane',complete:false,completedMoveId:null,moves:['Bölüm 3’ü yaz.'],where:null,question:null,prerequisite:null,alt:null}],question:null,summary:''},'Tez bölüm 3');
 assert.equal(lane.fronts.tez.status,'closed');
 // Bitti on an İş front closed by hand: done, but nothing closes in this change, so no “cephe kapandı”.
 const byHand=run(run(camp(front('imza','Dekanlık imzası',['Dilekçeyi götür.'])),{kind:'status',frontId:'imza',status:'closed'}),{kind:'complete',frontId:'imza'});
 assert.equal(last(byHand).label,'Hamle tamamlandı');assert.equal(handNotice(last(byHand)),null);
});
