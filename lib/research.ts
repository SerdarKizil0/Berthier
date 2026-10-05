import {type State,type Front,uid,validMove,normalize,canonicalTitle,dayKey} from './domain';
import {calendarDay,addDays} from './calendar';
export type Idea={id:string;text:string;kind:'idea'|'reading'|'question';laneId:string|null;createdAt:string;sourceId:string|null;status:'stored'|'dismissed'|'converted';reviewedAt?:string};
export type Review={id:string;step:number;startedAt:string;completedAt?:string;decisions:string[]};
export type IdeaInput={text:string;kind:Idea['kind'];laneId:string|null};
export function addIdeas(s:State,ideas:IdeaInput[],sourceId:string|null){s.ideas??={};for(const input of ideas){const lane=input.laneId?s.fronts[input.laneId]:null;if(input.laneId&&lane?.type!=='lane')throw Error('Fikir için geçerli bir proje seç.');if(Object.values(s.ideas).some(i=>i.sourceId===sourceId&&normalize(i.text)===normalize(input.text)))continue;const id=uid();s.ideas[id]={...input,id,createdAt:new Date().toISOString(),sourceId,status:'stored'};}}
export const staleFronts=(s:State,now=Date.now())=>Object.values(s.fronts).filter(f=>f.status!=='closed'&&now-Date.parse(f.touched)>=7*86400000);
export function laneSuggestion(s:State,f:Front){const today=calendarDay();if(Object.values(s.events??{}).some(e=>!e.cancelled&&e.frontId===f.id&&e.date&&e.date>=today&&e.date<=addDays(today,13)))return 'Önümüzdeki 14 günde tarihli kalemi var.';if(Date.now()-Date.parse(f.touched)>=28*86400000)return 'Uzun süredir bekliyor; yeniden değerlendirebilirsin.';return '';}
export function pendingIdeas(s:State){return Object.values(s.ideas??{}).filter(i=>i.status==='stored'&&!i.reviewedAt).sort((a,b)=>Number(!!a.laneId)-Number(!!b.laneId)||a.createdAt.localeCompare(b.createdAt));}
export type ResearchCommand={kind:string;ideaId?:string;frontId?:string;decision?:'keep'|'discard'|'move'|'front';text?:string;title?:string;step?:number;ids?:string[]};
export function researchAct(s:State,c:ResearchCommand){
 const log=(message:string)=>{if(s.review&&!s.review.completedAt)s.review.decisions.push(message);};
 if(c.kind==='reviewStart'){if(s.review&&!s.review.completedAt)return;if(s.review)(s.reviewHistory??=[]).push(structuredClone(s.review));s.review={id:uid(),step:0,startedAt:new Date().toISOString(),decisions:[]};return;}
 if(c.kind==='reviewStep'){if(!s.review||s.review.completedAt)throw Error('Önce teftişi başlat.');if(c.step===undefined||!Number.isInteger(c.step)||c.step<0||c.step>5)throw Error('Geçersiz teftiş adımı.');s.review.step=c.step;return;}
 // Items the review showed and the user left alone stay in the depot as seen (the removed “Depoda kalsın”).
 if(c.kind==='reviewFinish'){if(!s.review||s.review.completedAt)throw Error('Açık teftiş yok.');const now=new Date().toISOString();s.review.completedAt=now;for(const i of Object.values(s.ideas??{}))if(i.status==='stored'&&!i.reviewedAt)i.reviewedAt=now;return;}
 if(c.kind==='reviewContinue'){const f=s.fronts[c.frontId??''];if(!f)throw Error('Cephe bulunamadı.');f.touched=new Date().toISOString();log(`${f.title}: sürdür`);return;}
 const idea=s.ideas?.[c.ideaId??''];if(!idea||idea.status!=='stored')throw Error('Depo kalemi bulunamadı.');
 if(c.kind==='ideaAssign'){const f=s.fronts[c.frontId??''];if(!f||f.type!=='lane'||f.status==='closed')throw Error('Açık bir proje seç.');idea.laneId=f.id;log(`Depo kalemi ${f.title} projesine bağlandı.`);return;}
 if(c.kind!=='ideaDecide')throw Error('İşlem tanınmadı.');
 if(c.decision==='keep'||c.decision==='discard'){idea.reviewedAt=new Date().toISOString();if(c.decision==='discard')idea.status='dismissed';log(c.decision==='keep'?'Bir kalem depoda bırakıldı.':'Bir depo kalemi atıldı (geri alınabilir).');return;}
 if(!idea.laneId)throw Error('Önce fikri bir projeye ata.');
 if(!c.text||!validMove(c.text))throw Error('4+ kelimelik, 120 karakteri aşmayan somut bir hamle yaz.');
 let f=s.fronts[idea.laneId];if(!f||f.status==='closed')throw Error('Önce açık bir projeye ata.');
 if(c.decision==='front'){if(!c.title?.trim()||c.title.length>90)throw Error('Yeni cepheye kısa bir ad ver.');if(Object.values(s.fronts).some(x=>canonicalTitle(x.title)===canonicalTitle(c.title!)))throw Error('Bu adla bir cephe var; hamleye çevir seçeneğini kullan.');const id=uid();f={id,title:c.title.trim(),type:'lane',status:'held',moves:[],where:'',question:'',notes:[idea.text],touched:new Date().toISOString()};s.fronts[id]=f;}
 else if(c.decision!=='move')throw Error('Geçersiz karar.');
 f.moves.push({id:uid(),text:c.text});f.touched=new Date().toISOString();idea.status='converted';idea.reviewedAt=new Date().toISOString();log(`${f.title}: depodan bir hamle eklendi.`);
}
export function suggestedIdeaMove(i:Idea){const subject=i.text.replace(/[.!?]+$/,'').slice(0,65);return i.kind==='reading'?`${subject} metninin özetini oku ve 3 bulguyu yaz.`:`${subject} için ilk denemenin adımlarını yaz.`;}
