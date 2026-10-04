import {db,read,list,save} from '@/lib/notebook';
import {addIdeas} from '@/lib/research';
import {EventInput} from '@/lib/event-input';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {type State,type Dictation,fresh,uid,commitChanges,nextMove,replaceSlot,materializeOrder} from '@/lib/domain';
import {act,applyParsed,type Command} from '@/lib/reducer';
import {parseDictation,summarizeDays,type LlmConfig} from '@/lib/llm';
import {catchConflicts} from '@/lib/calendar';
import {completedOn,plainSummary,sourceHash,staleSummaries} from '@/lib/logbook';
import {placementsOf,type Placement} from '@/lib/kinds';
import {ROUTINE_KINDS} from '@/lib/routines';
import {z} from 'zod';
export const dynamic='force-dynamic';
const Input=z.object({id:z.string().uuid(),kind:z.enum(['enqueue','dictate','complete','approve','reorder','select','setup','status','edit','skipPrerequisite','undo','merge','event','cancelEvent','profile','seenConflict','reviewStart','reviewStep','reviewFinish','reviewContinue','ideaAssign','ideaDecide','importIdeas','reportOpen','seenWarning','logbookSummaries','rhythm','rekind','retype',...ROUTINE_KINDS as [string,...string[]]]),seen:z.boolean().optional(),warningId:z.string().max(500).optional(),source:z.enum(['document','dictation']).optional(),replyTo:z.string().uuid().optional(),frontId:z.string().optional(),ideaId:z.string().optional(),sourceId:z.string().optional(),decision:z.enum(['keep','discard','move','front']).optional(),title:z.string().max(90).optional(),step:z.number().int().min(0).max(5).optional(),text:z.string().max(20000).optional(),status:z.enum(['active','held','closed']).optional(),ids:z.array(z.string()).optional(),orderDate:z.string().optional(),orderSnapshot:z.string().optional(),changeId:z.string().optional(),index:z.number().int().nonnegative().optional(),targetId:z.string().optional(),where:z.string().max(120).optional(),question:z.string().max(120).optional(),skip:z.boolean().optional(),event:EventInput.omit({dateText:true,frontTitle:true}).extend({id:z.string(),date:z.string().nullable(),frontId:z.string().nullable(),cancelled:z.boolean().optional()}).optional(),eventId:z.string().optional(),conflictId:z.string().max(500).optional(),profile:z.object({name:z.string().max(100),number:z.string().max(50),department:z.string().max(100),university:z.string().max(100)}).optional(),rhythm:z.object({report:z.string().max(5),reviewDay:z.number().int().min(0).max(6),reviewTime:z.string().max(5),quietFrom:z.string().max(5),quietTo:z.string().max(5)}).optional(),
 // Rutinler and kinds (4 Ekim).
 routineId:z.string().max(100).optional(),stepKey:z.string().max(40).optional(),day:z.string().max(10).optional(),start:z.string().max(40).optional(),end:z.string().max(40).optional(),minutes:z.number().int().min(1).max(1440).optional(),sessionId:z.string().max(100).optional(),days:z.array(z.number().int().min(0).max(6)).max(7).optional(),time:z.string().max(5).optional(),patterns:z.array(z.object({routineId:z.string().max(100),days:z.array(z.number().int().min(0).max(6)).min(1).max(7),time:z.string().max(5)})).max(100).optional(),reminder:z.enum(['none','half','all']).optional(),on:z.boolean().optional(),leadMin:z.number().int().min(0).max(240).optional(),show:z.boolean().optional(),paused:z.boolean().optional(),what:z.enum(['reminder','timer']).optional(),accept:z.boolean().optional(),trial:z.enum(['all','keep','none']).optional(),ref:z.string().max(240).optional(),to:z.enum(['move','routine','event','idea']).optional(),count:z.number().int().min(1).max(7).optional(),type:z.enum(['course','lane','application','general','routine']).optional()});
const headers={'Cache-Control':'no-store'};
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers});
export async function GET(){const user=await getChatGPTUser();if(!user)return respond({error:'Giriş yapman gerekiyor.'},401);try{const {state,revision}=await read(user.userId);return respond({state,revision,dictations:await list(user.userId)});}catch{return respond({error:'Veri defterine ulaşılamıyor. Tekrar dene.'},503);}}
export async function POST(req:Request){
 const user=await getChatGPTUser();if(!user)return respond({error:'Giriş yapman gerekiyor.'},401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return respond({error:'İstek kaynağı doğrulanamadı.'},403);
 let input:z.infer<typeof Input>;try{if(Number(req.headers.get('content-length')??0)>100000)throw Error();input=Input.parse(await req.json());}catch{return respond({error:'Geçersiz veya çok uzun girdi.'},400);}
 let processing=false;
 try{
 let {state,revision}=await read(user.userId);
 if(state.receipts.includes(input.id))return respond({state,revision,dictations:await list(user.userId),replayed:true});
 let replySource:Dictation|null=null;
 if(input.replyTo){replySource=await db().prepare('SELECT id,raw,context,created_at,status,result FROM dictations WHERE id = ? AND owner = ?').bind(input.replyTo,user.userId).first<Dictation>();if(!replySource||!['question','answered'].includes(replySource.status))throw Error('Yanıtlanacak soru bulunamadı.');}
 if(input.kind==='enqueue'){
 const raw=input.text?.trim();if(!raw)throw Error('Önce söylemek istediğini yaz.');
 const metadata=JSON.stringify({kind:'dictate',replyTo:input.replyTo??null,source:input.source??'dictation'});
 await db().prepare('INSERT OR IGNORE INTO dictations(id,owner,raw,context,created_at,status,result) VALUES (?,?,?,?,?,?,?)').bind(input.id,user.userId,raw,input.frontId??null,new Date().toISOString(),'queued',metadata).run();
 const row=await db().prepare('SELECT owner,raw,context,result FROM dictations WHERE id = ?').bind(input.id).first<{owner:string;raw:string;context:string|null;result:string|null}>();
 if(!row||row.owner!==user.userId||row.raw!==raw||row.context!==(input.frontId??null)||(JSON.parse(row.result??'{}').replyTo??null)!==(input.replyTo??null)||(JSON.parse(row.result??'{}').source??'dictation')!==(input.source??'dictation'))throw Error('Girdi kimliği çakıştı.');
 return respond({queued:true,id:input.id},202);
 }
 let n:State=state;let summary='';
 const runtime=env as unknown as Record<string,string>;const anthropicKey=runtime.ANTHROPIC_API_KEY||process.env.ANTHROPIC_API_KEY;
 const config:LlmConfig=anthropicKey?{provider:'anthropic',key:anthropicKey,workspaceId:runtime.ANTHROPIC_WORKSPACE_ID||process.env.ANTHROPIC_WORKSPACE_ID,model:runtime.ANTHROPIC_MODEL||process.env.ANTHROPIC_MODEL||'claude-sonnet-5'}:{provider:'gemini',key:runtime.GEMINI_API_KEY||process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY||'',model:runtime.GEMINI_MODEL||process.env.GEMINI_MODEL||'gemini-2.5-flash'};
 if(input.kind==='importIdeas'){const source=await db().prepare('SELECT raw,context,result FROM dictations WHERE id = ? AND owner = ?').bind(input.sourceId??'',user.userId).first<{raw:string;context:string|null;result:string|null}>();if(!source)throw Error('Eski dikte bulunamadı.');if(state.ideaImports?.includes(input.sourceId!))return respond({state,revision,dictations:await list(user.userId),summary:'Bu dikte daha önce tarandı.'});const parsed=await parseDictation(source.raw,state,source.context,config,undefined,undefined,true,JSON.parse(source.result??'{}').source==='document');n=commitChanges(state,'Eski diktedeki fikirler depoya aktarıldı',draft=>{addIdeas(draft,parsed.ideas??[],input.sourceId!);(draft.ideaImports??=[]).push(input.sourceId!);});n.receipts.push(input.id);await save(user.userId,n,revision);return respond({state:n,revision:revision+1,dictations:await list(user.userId),summary:(parsed.ideas?.length??0)+' depo kalemi bulundu.'});}
 // Sefer defteri: the model writes the missing day records; a plain line stands in when it cannot.
 if(input.kind==='logbookSummaries'){const stale=staleSummaries(state);if(!stale.length)return respond({state,revision,dictations:await list(user.userId),summary:''});let written:Record<string,string>={};try{written=await summarizeDays(stale,config);}catch{}const latest=await read(user.userId);n=latest.state;const at=new Date().toISOString();for(const x of stale){if(sourceHash(completedOn(n,x.day),x.first)!==x.hash)continue;const text=written[x.day];(n.logbook??={})[x.day]=text?{summary:text,hash:x.hash,at}:{summary:plainSummary(x.items),hash:x.hash,at,fallback:true};}n.receipts.push(input.id);await save(user.userId,n,latest.revision);return respond({state:n,revision:latest.revision+1,dictations:await list(user.userId),summary:''});}
 if(input.kind==='dictate'||(input.kind==='complete'&&!input.skip)){
 const f=input.frontId?state.fronts[input.frontId]:undefined;
 if(input.kind==='complete'&&!f)throw Error('Cephe bulunamadı.');
 const raw=input.text?.trim()||(input.kind==='complete'?'Hamleyi tamamladım.':'');if(!raw)throw Error('Önce söylemek istediğini yaz.');
 await db().prepare('INSERT OR IGNORE INTO dictations(id,owner,raw,context,created_at,status,result) VALUES (?,?,?,?,?,?,?)').bind(input.id,user.userId,raw,input.frontId??null,new Date().toISOString(),'queued',JSON.stringify({kind:input.kind,replyTo:input.replyTo??null,source:input.source??'dictation'})).run();
 const original=await db().prepare('SELECT owner,raw,context,result FROM dictations WHERE id = ?').bind(input.id).first<{owner:string;raw:string;context:string|null;result:string|null}>();
 if(!original||original.owner!==user.userId||original.raw!==raw||original.context!==(input.frontId??null))throw Error('Girdi kimliği çakıştı. Yeniden gönder.');
 if((JSON.parse(original.result??'{}').source??'dictation')!==(input.source??'dictation'))throw Error('Girdi kaynağı değiştirilemez.');
 if((JSON.parse(original.result??'{}').replyTo??null)!==(input.replyTo??null))throw Error('Yanıt bağlamı değiştirilemez.');
 processing=true;let placed:Placement[]|undefined;
 const modelText=replySource?JSON.stringify({previousDictation:replySource.raw,question:JSON.parse(replySource.result??'{}').question,answer:raw}):raw;
 const parsed=await parseDictation(modelText,state,input.frontId??replySource?.context??null,config,input.kind==='complete'?f:undefined,undefined,false,input.source==='document'||JSON.parse(replySource?.result??'{}').source==='document');
 // The user may edit their map while the model is working. Apply only to a fresh revision.
 const latest=await read(user.userId);if(latest.state.receipts.includes(input.id))return respond({state:latest.state,revision:latest.revision,dictations:await list(user.userId),replayed:true});
 if(input.kind==='complete'&&JSON.stringify(latest.state.fronts[f!.id])!==JSON.stringify(f))throw Error('Cephe bu sırada değişti. Notun saklandı; yeniden dene.');
 state=latest.state;revision=latest.revision;
 for(const item of parsed.items){if(item.id&&!state.fronts[item.id])throw Error('Cephe değişti; girdin saklandı. Yeniden dene.');if(item.completedMoveId&&!state.fronts[item.id!]?.moves.some(m=>m.id===item.completedMoveId&&!m.doneAt))throw Error('Hamle bu sırada değişti. Girdin saklandı; yeniden dene.');}

 if(input.kind==='complete'&&f){
 const item=parsed.items.find(x=>x.id===f.id);if(!item||parsed.question)throw Error('Sıradaki hamle netleşmedi. Notun kaydedildi; tekrar dene veya Atla ile tamamla.');
 // A completion only changes the chosen front; model cannot complete unrelated fronts.
 n=commitChanges(state,'Hamle tamamlandı; kaldığın yer kaydedildi',draft=>{const front=draft.fronts[f.id];const m=nextMove(front);if(m){materializeOrder(draft,front.id);m.doneAt=new Date().toISOString();}if(item.where!==null)front.where=item.where;if(item.question!==null)front.question=item.question;
 if(item.moves.length&&!m?.eventId){front.moves=front.moves.filter(m=>!!m.doneAt);front.moves.push(...item.moves.map(text=>({id:uid(),text})));}front.notes.push(raw);front.touched=new Date().toISOString();replaceSlot(draft,front,m);});
 }else{n=applyParsed(state,parsed,raw,undefined,input.id);if(!parsed.question)placed=placementsOf(state,n,parsed);}
 summary=parsed.question||parsed.summary;catchConflicts(state,n);
 n.receipts.push(input.id);await save(user.userId,n,revision,{id:input.id,status:parsed.question?'question':'done',result:JSON.stringify({summary,question:parsed.question,kind:input.kind,replyTo:input.replyTo??null,source:input.source??'dictation',...(placed?{placed}:{})}),replyTo:input.replyTo});
 }else{n=act(state,input as Command);catchConflicts(state,n);n.receipts.push(input.id);await save(user.userId,n,revision);summary=n.changes.length>state.changes.length?n.changes.at(-1)!.label:input.kind==='undo'?n.changes.at(-1)?.label??'Kaydedildi.':'Kaydedildi.';}
 return respond({state:n,revision:revision+1,dictations:await list(user.userId),summary});
 }catch(e){const message=e instanceof Error?e.message:'İşlem kaydedilemedi; tekrar dene.';try{if(processing)await db().prepare("UPDATE dictations SET status = 'failed', result = ? WHERE id = ? AND owner = ? AND status IN ('queued','failed')").bind(JSON.stringify({summary:message,kind:input.kind==='enqueue'?'dictate':input.kind,replyTo:input.replyTo??null,source:input.source??'dictation'}),input.id,user.userId).run();}catch{}return respond({error:message},503);}
}

