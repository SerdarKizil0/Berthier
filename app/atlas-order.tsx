'use client';
import {Fragment,useEffect,useRef,useState} from 'react';
import {ArrowDownUp,ArrowUpRight,Check,ChevronRight,Ellipsis,GripVertical} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {type State,type Front,type Order,directGoal,isOpen,nextMove,keepPassed} from '@/lib/domain';
import {clockText,daysTag,nextDated,urgency} from '@/lib/expedition/camps';
import {calendarDay} from '@/lib/calendar';
import {atTime} from '@/lib/turkish';

type Action=(body:{kind:string;[key:string]:unknown},options?:{quiet?:boolean})=>Promise<boolean|undefined>;
type Props={state:State;order:Order;busy:boolean;online:boolean;open:(id:string)=>void;complete:(front:Front)=>void;edit:(front:Front,text:string)=>void;select:()=>void;action:Action;why:string;say:(frontId:string)=>void};
const pad=(n:number)=>String(n).padStart(2,'0');
// The change that marked this camp as passed today; “Geri al” undoes exactly that change.
export function passedBy(state:State,order:Order,frontId:string){return [...state.changes].reverse().find(c=>c.ops.some(o=>!o.undone&&o.key==='order:'+order.date&&!!(o.after as Order|null)?.slots.some(x=>x.frontId===frontId&&x.doneAt)&&!(o.before as Order|null)?.slots.some(x=>x.frontId===frontId&&x.doneAt)));}
// Karargâh, design 1a (“önce hamle”): the next move first, with one main action (Bitti); then the route as
// the morning report's strip and rows. The map stays in the Harita tab (“Haritada aç”).
export default function AtlasOrder({state,order,busy,online,why,open,complete,edit,select,action,say}:Props){
 const [picked,setPicked]=useState<{id:string;done:boolean}|null>(null),[more,setMore]=useState(false);
 // A camp chosen while open gives way to the next open camp once it is passed; a passed camp chosen on purpose stays.
 const slots=order.slots,firstOpen=slots.find(s=>!s.doneAt),chosen=picked?slots.find(s=>s.frontId===picked.id):undefined,slot=chosen&&(picked!.done||!chosen.doneAt)?chosen:firstOpen??chosen??slots[0];
 const front=slot?state.fronts[slot.frontId]:undefined,current=front?.moves.find(m=>m.id===slot?.moveId),rank=slot?slots.indexOf(slot):0,passed=slot?.doneAt?clockText(slot.doneAt):'',passedChange=slot&&passed?passedBy(state,order,slot.frontId):undefined;
 const nDone=slots.filter(s=>s.doneAt).length,allDone=slots.length>0&&nDone===slots.length,today=calendarDay();
 // Urgency as on the map: the front's nearest dated item (critical ≤2 days, near ≤7).
 const tag=(frontId:string,done?:string)=>{const f=state.fronts[frontId];if(!f)return {tone:'calm',chip:''};if(done)return {tone:'done',chip:'GEÇİLDİ '+clockText(done)};const days=nextDated(state,frontId,today)?.days??null;return {tone:urgency(f,days,false),chip:daysTag(f,days)};};
 function pick(id:string){setMore(false);setPicked({id,done:!!slots.find(s=>s.frontId===id)?.doneAt});}
 // Kaldır (5 Ekim): the slot's move leaves its front's queue; the front's next move takes the slot (or the camp leaves the route).
 const openMove=(frontId:string,moveId:string)=>{const m=state.fronts[frontId]?.moves.find(x=>x.id===moveId);return m&&isOpen(m)?m:undefined;};
 function remove(frontId:string,moveId:string){setMore(false);void action({kind:'removeMove',frontId,moveId});}
 const reorder=useReorder({state,order,busy,online,action,saved:ids=>{const first=ids.find(id=>!order.slots.find(s=>s.frontId===id)?.doneAt);if(first)pick(first);}});
 const head=slot?tag(slot.frontId,slot.doneAt):null,stale=!!front&&!passed&&nextMove(front)?.id!==slot?.moveId;
 return <>
  <section className="hq-move" aria-label="Sıradaki hamle">
  {allDone?<><div className="hq-move-top"><span>SEFER TAMAMLANDI · {nDone} / {slots.length}</span></div><h2 className="hq-move-text">Günün emri tamamlandı.</h2><p className="hq-why">↳ Bütün kamplar alındı. Yarının rotası sabah önerilir.</p><div className="hq-actions"><button className="btn-quiet" onClick={()=>open('logbook')}>Sefer defterini aç</button></div></>
  :slot&&front?<><div className="hq-move-top"><span>{passed?'GEÇİLDİ':slot===firstOpen?'SIRADAKİ HAMLE':'ROTADAKİ HAMLE'} · {pad(rank+1)} / {pad(slots.length)}</span>{head?.chip&&<span className={`hq-chip is-${head.tone}`}>{head.chip}</span>}</div>
   <button className="hq-front" onClick={()=>open(front.id)}><span className={`hq-type ${front.type}`}/>{front.title}<ChevronRight size={14}/></button>
   {front.type==='lane'&&front.where&&<p className="hq-where">Kaldığın yer: {front.where}</p>}
   <h2 className={passed?'hq-move-text is-passed':'hq-move-text'} key={slot.moveId}>{slot.text}</h2>
   <p className="hq-why">↳ {passed?`Bugün ${atTime(passed)} tamamlandı.`:current?.prerequisiteReason??slot.reason}</p>
   <div className="hq-actions">{passed?<button className="btn-quiet" onClick={()=>passedChange&&action({kind:'undo',changeId:passedChange.id})} disabled={busy||!online||!passedChange}>Geri al</button>:<><button className="btn-main" disabled={busy||!online||current?.doneAt!==undefined||stale} onClick={()=>complete(front)}><Check size={18}/>Bitti</button><button className="btn-quiet" onClick={()=>edit(front,slot.text)} disabled={busy}>Düzenle</button><button className="btn-quiet hq-more" aria-label="Diğer" aria-expanded={more} onClick={()=>setMore(!more)}><Ellipsis size={20}/></button></>}</div>
   {more&&!passed&&<div className="hq-more-list"><button className="text-button" onClick={()=>open(front.id)}>Cepheyi aç</button><button className="text-button" onClick={()=>say(front.id)}>Bu cepheye söyle</button>{directGoal(front)&&<button className="text-button" disabled={busy||!online} onClick={()=>action({kind:'skipPrerequisite',frontId:front.id})}>Ön adıma gerek yok</button>}<button className="text-button" disabled={busy||!online||!openMove(front.id,slot.moveId)} onClick={()=>remove(front.id,slot.moveId)}>Kaldır</button></div>}
   {!passed&&why&&<p className="why">{why}</p>}{stale&&<p className="why">Cephe güncellendi. Yeni hamleyi görmek için cephe seçimini güncelle.</p>}</>
  :<><div className="hq-move-top"><span>GÜNÜN EMRİ</span></div><h2 className="hq-move-text">Bugün açık emir yok.</h2><p className="hq-why">Haritandan cephe seçebilir ya da bugünü boş bırakabilirsin.</p><div className="hq-actions"><button className="btn-quiet" disabled={busy} onClick={select}>Cephe ekle</button></div></>}
  </section>
  {/* The route head stays on a day without an order (0 CEPHE): “Haritada aç” is the way to the map and the front list. */}
  <section className="hq-route" aria-label="Rota">
   <div className="hq-route-head"><h2>ROTA · {slots.length} CEPHE{order.approvedAt?' · ONAYLI':''}</h2><button onClick={()=>open('map')}>HARİTADA AÇ<ArrowUpRight size={14}/></button></div>
   {slots.length>0&&<>   <div className="hq-strip" aria-hidden="true"><span className="mr-hq">✳</span>{slots.map((s,i)=><Fragment key={s.frontId}><span className={s.doneAt&&(i===0||slots[i-1].doneAt)?'hq-line is-sealed':'mr-dots'}/><span className={`mr-node is-${tag(s.frontId,s.doneAt).tone}${slot?.frontId===s.frontId&&!allDone?' is-current':''}`}>{s.doneAt?<Check size={14}/>:pad(i+1)}</span></Fragment>)}</div>
   {slots.map((s,i)=>{const t=tag(s.frontId,s.doneAt),title=state.fronts[s.frontId]?.title;return <div className="hq-item" key={s.frontId}><button className={['hq-row',s.doneAt?'is-done':'',s===firstOpen?'is-next':'',slot?.frontId===s.frontId&&!allDone?'is-current':''].join(' ').trim()} aria-current={slot?.frontId===s.frontId&&!allDone?'true':undefined} onClick={()=>pick(s.frontId)}><span className="hq-num">{s.doneAt?'✓':pad(i+1)}</span><span className="hq-row-body"><small>{title}</small><span>{s.text}</span></span>{t.chip&&<span className={`hq-chip is-${t.tone}`}>{t.chip}</span>}</button>{!s.doneAt&&openMove(s.frontId,s.moveId)&&<button className="hq-remove" aria-label={`Kaldır: ${title} · ${s.text}`} disabled={busy||!online} onClick={()=>remove(s.frontId,s.moveId)}>Kaldır</button>}</div>;})}
   {!order.approvedAt&&<button className="hq-approve" disabled={busy||!online||!state.setup} onClick={()=>action({kind:'approve'})}><span>Emri onayla</span><span>{slots.length} CEPHE</span></button>}
   {!order.approvedAt&&(why?<p className="why">{why}</p>:!state.setup&&<p className="why">Önce bu haftanın aktif projelerini seç.</p>)}
   <div className="hq-links">{slots.length>1&&<button className="text-button" onClick={reorder.begin} disabled={busy}><ArrowDownUp size={16}/>Sırayı düzenle</button>}<button className="text-button" disabled={busy} onClick={select}>Cephe ekle / çıkar</button></div></>}
  </section>
  {reorder.dialog}
 </>;
}

// The “Sırayı düzenle” dialog. Karargâh and the morning report open the same one.
export function useReorder({state,order,busy,online,action,saved}:{state:State;order:Order;busy:boolean;online:boolean;action:Action;saved?:(ids:string[])=>void}){
 const [reordering,setReordering]=useState(false),[ids,setIds]=useState<string[]>([]),[snapshot,setSnapshot]=useState('');const cancelDrag=useRef<(()=>boolean)|null>(null);
 function begin(){setIds(order.slots.map(s=>s.frontId));setSnapshot(JSON.stringify(order));setReordering(true);}
 const stale=snapshot!==JSON.stringify(order);
 return {begin,dialog:<Dialog open={reordering} onOpenChange={value=>!busy&&setReordering(value)}><DialogContent className="berthier-dialog reorder-dialog" onEscapeKeyDown={e=>{if(cancelDrag.current?.())e.preventDefault();}}><DialogTitle>Sırayı düzenle</DialogTitle><DialogDescription>Sağdaki tutamacı basılı tut, hamleyi istediğin yere sürükle. Bıraktığında yeni sırayı görebilirsin. Haritada bir kampı basılı tut, sonra başka bir kampın üstüne bırak. Masaüstünde doğrudan sürükle.</DialogDescription>
   {stale?<div className="notice">Emir bu sırada güncellendi. Yeni haliyle devam et.<button onClick={begin}>Güncel sırayı aç</button></div>:<SortableRoute ids={ids} setIds={setIds} order={order} fronts={state.fronts} disabled={busy} cancelDrag={cancelDrag}/>}
   <div className="row-actions"><button className="primary" disabled={busy||!online||stale} onClick={async()=>{if(await action({kind:'reorder',ids,orderDate:order.date,orderSnapshot:snapshot})){setReordering(false);saved?.(ids);}}}>Sırayı kaydet</button><button disabled={busy} onClick={()=>setReordering(false)}>Vazgeç</button></div><p className="quiet">Kaydetmeden günün emri değişmez. Sonradan kayıt defterinden geri alabilirsin.</p>
  </DialogContent></Dialog>};
}

function SortableRoute({ids,setIds,order,fronts,disabled,cancelDrag}:{ids:string[];setIds:(ids:string[])=>void;order:Order;fronts:State['fronts'];disabled:boolean;cancelDrag:React.RefObject<(()=>boolean)|null>}){
 const passed=(id:string)=>!!order.slots.find(s=>s.frontId===id)?.doneAt;
 const list=useRef<HTMLOListElement>(null),latest=useRef(ids),gesture=useRef<{id:string;pointer:number;x:number;y:number;lastY:number;before:string[];active:boolean;timer:ReturnType<typeof setTimeout>|null;raf:number|null}|null>(null);
 const [lifted,setLifted]=useState<string|null>(null),[announcement,setAnnouncement]=useState('');const keyboard=useRef<{id:string;before:string[]}|null>(null);latest.current=ids;
 // Passed camps keep their place: only the open ones take the new relative order.
 function move(id:string,to:number){const from=latest.current.indexOf(id);if(from===to||from<0||to<0||to>=latest.current.length)return;const next=[...latest.current];next.splice(from,1);next.splice(to,0,id);place(id,keepPassed(order,next));}
 function place(id:string,next:string[]){if(next.join()===latest.current.join())return;latest.current=next;setIds(next);setAnnouncement(`${fronts[id]?.title}, ${next.indexOf(id)+1}. sırada.`);}
 function step(id:string,dir:number){const open=latest.current.filter(x=>!passed(x)),i=open.indexOf(id),j=i+dir;if(i<0||j<0||j>=open.length)return;[open[i],open[j]]=[open[j],open[i]];place(id,keepPassed(order,open));}
 function target(y:number){const g=gesture.current;if(!g?.active||!list.current)return;const rows=[...list.current.querySelectorAll<HTMLElement>('[data-front]')].filter(row=>row.dataset.front!==g.id);let index=rows.length;for(let i=0;i<rows.length;i++){const b=rows[i].getBoundingClientRect();if(y<b.top+b.height/2){index=i;break;}}move(g.id,index);}
 function finish(cancel=false){const g=gesture.current;if(!g)return;if(g.timer)clearTimeout(g.timer);if(g.raf)cancelAnimationFrame(g.raf);gesture.current=null;if(cancel&&g.active){latest.current=g.before;setIds(g.before);}if(list.current?.hasPointerCapture(g.pointer))list.current.releasePointerCapture(g.pointer);setLifted(null);if(g.active)setAnnouncement(cancel?'Taşıma iptal edildi.':'Hamle yeni yerine bırakıldı. Kaydettiğinde uygulanacak.');}
 useEffect(()=>{const cancel=()=>{if(keyboard.current){setIds(keyboard.current.before);keyboard.current=null;setLifted(null);setAnnouncement('Taşıma iptal edildi.');return true;}if(gesture.current){finish(true);return true;}return false;};cancelDrag.current=cancel;window.addEventListener('blur',cancel);return()=>{cancelDrag.current=null;window.removeEventListener('blur',cancel);const g=gesture.current;if(g?.timer)clearTimeout(g.timer);if(g?.raf)cancelAnimationFrame(g.raf);};},[]);
 function start(event:React.PointerEvent<HTMLButtonElement>,id:string){if(disabled||event.button!==0||!event.isPrimary||gesture.current)return;keyboard.current=null;const g={id,pointer:event.pointerId,x:event.clientX,y:event.clientY,lastY:event.clientY,before:[...latest.current],active:false,timer:null as ReturnType<typeof setTimeout>|null,raf:null as number|null};gesture.current=g;list.current?.setPointerCapture(event.pointerId);g.timer=setTimeout(()=>{if(gesture.current!==g)return;g.active=true;setLifted(id);setAnnouncement(`${fronts[id]?.title} tutuldu. Yeni yerine sürükle.`);function scroll(){if(gesture.current!==g||!list.current)return;const bounds=list.current.getBoundingClientRect(),delta=g.lastY<bounds.top+42?-8:g.lastY>bounds.bottom-42?8:0;if(delta){list.current.scrollTop+=delta;target(g.lastY);}g.raf=requestAnimationFrame(scroll);}g.raf=requestAnimationFrame(scroll);},event.pointerType==='mouse'?0:350);}
 function key(event:React.KeyboardEvent<HTMLButtonElement>,id:string){if(disabled)return;if(event.key===' '||event.key==='Enter'){event.preventDefault();if(keyboard.current){keyboard.current=null;setLifted(null);setAnnouncement('Hamle bırakıldı.');}else{keyboard.current={id,before:[...latest.current]};setLifted(id);setAnnouncement('Hamle tutuldu. Yukarı ve aşağı tuşlarıyla taşı; Enter ile bırak.');}}else if(keyboard.current?.id===id){if(event.key==='Escape'){event.preventDefault();setIds(keyboard.current.before);keyboard.current=null;setLifted(null);}else if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();step(id,event.key==='ArrowUp'?-1:1);}}}
 return <><p className="sr-only" id="route-keyboard-help">Klavye ile: boşlukla tut, yukarı/aşağı tuşlarıyla taşı, Enter ile bırak, Escape ile iptal et.</p><ol ref={list} className="sortable-route" onPointerMove={e=>{const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;g.lastY=e.clientY;if(!g.active){if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>10)finish(true);return;}e.preventDefault();target(e.clientY);}} onPointerUp={e=>{if(gesture.current?.pointer===e.pointerId)finish();}} onPointerCancel={e=>{if(gesture.current?.pointer===e.pointerId)finish(true);}} onLostPointerCapture={e=>{if(gesture.current?.pointer===e.pointerId)finish(true);}}>{ids.map((id,i)=><li key={id} data-front={id} className={[lifted===id?'is-lifted':'',passed(id)?'is-passed':''].join(' ').trim()||undefined}><span className="sort-number">{passed(id)?'✓':String(i+1).padStart(2,'0')}</span><span className="sort-content"><strong>{fronts[id]?.title??'Cephe'}</strong><span>{order.slots.find(s=>s.frontId===id)?.text}</span></span>{passed(id)?<span className="drag-handle is-fixed"><span className="sr-only">Geçildi; yeri değişmez.</span></span>:<button className="drag-handle" disabled={disabled} aria-label={`${fronts[id]?.title} hamlesini taşı`} aria-describedby="route-keyboard-help" aria-pressed={lifted===id} onPointerDown={e=>start(e,id)} onKeyDown={e=>key(e,id)} onContextMenu={e=>e.preventDefault()}><GripVertical size={22}/></button>}</li>)}</ol><div className="sr-only" role="status" aria-live="polite">{announcement}</div></>;
}
