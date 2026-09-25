import type {State, Front, Move} from './domain';
export type EventKind='exam'|'quiz'|'presentation'|'assignment'|'application'|'appointment'|'class'|'lab';
export type DocumentItem={name:string;holder:string;status:'todo'|'requested'|'ready'|'uploaded';category:'reference'|'official'|'text'|'cv'|'other'};
export type CalendarEvent={id:string;title:string;kind:EventKind;frontId:string|null;date:string|null;time:string|null;endTime:string|null;location:string;bring:string[];weekly:boolean;prepDays:number|null;documents:DocumentItem[];institution:string;program:string;portal:string;cancelled?:boolean};
export type Profile={name:string;number:string;department:string;university:string};
export const kindNames:Record<EventKind,string>={exam:'Sınav',quiz:'Quiz',presentation:'Sunum',assignment:'Teslim',application:'Başvuru',appointment:'Randevu',class:'Ders',lab:'Lab'};
export const calendarDay=(now=new Date())=>new Date(now.getTime()+3*3600000).toISOString().slice(0,10);
export function addDays(date:string,n:number){return new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
export const daysBetween=(a:string,b:string)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
export function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
export const validTime=(s:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
// Calendar dates use Istanbul midnight, independently of the 04:00 workday boundary.
export function resolveDate(text:string|null,today=calendarDay()):string|null{
 if(!text)return null;const x=text.toLocaleLowerCase('tr-TR').trim().replace(/[’']/g,'');
 if(validDate(x))return x;
 if(x==='bugün')return today;if(x==='yarın')return addDays(today,1);if(x==='öbür gün')return addDays(today,2);
 const names=['pazar','pazartesi','salı','çarşamba','perşembe','cuma','cumartesi'];const weekday=names.findIndex(w=>x===w||x===`bu ${w}`||x===`haftaya ${w}`||x===`gelecek hafta ${w}`||x===`her ${w}`);
 if(weekday>=0){const current=new Date(today+'T12:00:00Z').getUTCDay();const nextWeek=x.startsWith('haftaya')||x.startsWith('gelecek hafta');return addDays(today,nextWeek?7-((current+6)%7)+((weekday+6)%7):(weekday-current+7)%7);}
 const months=['ocak','şubat','mart','nisan','mayıs','haziran','temmuz','ağustos','eylül','ekim','kasım','aralık'];const m=x.match(/^(\d{1,2})\s+([a-zçğıöşü]+)(?:\s+(\d{4}))?$/);let date='';
 if(m&&months.includes(m[2]))date=`${m[3]||today.slice(0,4)}-${String(months.indexOf(m[2])+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
 const day=x.match(/^(?:ayın|bu ayın)\s+(\d{1,2})(?:i|ı|u|ü)?$/);if(day)date=today.slice(0,7)+'-'+day[1].padStart(2,'0');
 // Do not silently roll a past, year-less expression to next year/month.
 if(date&&validDate(date)&&(m?.[3]||date>=today))return date;return null;
}
export function occurrences(events:CalendarEvent[],from:string,to:string){const out:CalendarEvent[]=[];for(const e of events){if(e.cancelled||!e.date)continue;if(e.weekly){for(let d=from;d<=to;d=addDays(d,1))if(d>=e.date&&daysBetween(e.date,d)%7===0)out.push({...e,date:d});}else if(e.date>=from&&e.date<=to)out.push(e);}return out.sort((a,b)=>a.date!.localeCompare(b.date!)||(a.time??'99').localeCompare(b.time??'99'));}
const minute=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
export type Conflict={id:string;a:CalendarEvent;b:CalendarEvent;severity:'hard'|'soft';reason:string;move:CalendarEvent};
export function conflicts(events:CalendarEvent[],from=calendarDay()):Conflict[]{
 const dated=events.filter(e=>e.date&&!e.cancelled);const last=addDays(from,366);
 const far=dated.filter(e=>!e.weekly&&e.date!>last);const futureWeekly=[...new Set(far.map(e=>e.date!))].flatMap(d=>occurrences(events.filter(e=>e.weekly),d,d));
 const rows=[...occurrences(events,from,last),...far,...futureWeekly],result:Conflict[]=[];
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i],b=rows[j];if(a.id===b.id||a.date!==b.date||!a.time||!b.time)continue;
 const as=minute(a.time),bs=minute(b.time),ae=a.endTime?minute(a.endTime):as,be=b.endTime?minute(b.endTime):bs;
 const overlap=as===bs||(as<=bs&&ae>bs)||(bs<=as&&be>as);const travel=!overlap&&a.location&&b.location&&a.location.toLocaleLowerCase('tr-TR')!==b.location.toLocaleLowerCase('tr-TR')&&((as<=bs&&a.endTime&&bs-ae<30)||(bs<as&&b.endTime&&as-be<30));
 if(!overlap&&!travel)continue;const severity=overlap&&a.kind!=='class'&&b.kind!=='class'?'hard':'soft';const move=a.kind==='exam'||(b.kind==='presentation'&&a.kind!=='presentation')?b:a;
 result.push({id:[a.id,b.id].sort().join(':')+':'+a.date+':'+[a.time,a.endTime,b.time,b.endTime].join('-'),a,b,severity,reason:travel?'Farklı yerler arasında 30 dakikadan az var.':severity==='soft'?'Ders saatiyle örtüşüyor.':'Saatler örtüşüyor.',move});}
 return result;
}
const major=(e:CalendarEvent)=>['exam','presentation','assignment','application'].includes(e.kind);
export function denseDays(events:CalendarEvent[]){const counts:Record<string,number>={};for(const e of events)if(!e.cancelled&&e.date&&major(e))counts[e.date]=(counts[e.date]??0)+1;return new Set(Object.keys(counts).filter(d=>counts[d]>=2));}
export function prepPlan(e:CalendarEvent,events:CalendarEvent[],today:string,defaults:Partial<Record<EventKind,number>>={}):Move[]{
 if(!e.date||e.cancelled||!['exam','quiz','presentation','assignment','application'].includes(e.kind))return [];
 const title=e.title.slice(0,32),steps:{key:string;days:number;text:string;dependent?:boolean}[]=[];const add=(key:string,days:number,text:string,dependent=false)=>steps.push({key,days,text,dependent});
 const start=e.prepDays??defaults[e.kind]??({exam:10,quiz:3,presentation:7,assignment:7,application:28}[e.kind as 'exam']);
 if(e.kind==='exam'||e.kind==='quiz'){add('topics',start,`${title} için ders sayfasını aç ve konuları listele.`);add('practice',Math.max(2,Math.floor(start/2)),`${title} konularından 3 örnek soru seç ve çöz.`);add('final',1,`${title} için yanlış çözdüğün 3 soruyu yeniden çöz.`);}
 if(e.kind==='presentation'){add('outline',start,`${title} için ana mesajı ve 3 bölüm başlığını yaz.`);add('slides',Math.max(3,start-2),`${title} için ilk 3 slaytı oluştur.`);add('rehearsal',2,`${title} için süre tutarak ilk tam provayı yap ve süresini kaydet.`);add('final',1,`${title} için slaytları aç ve son kez prova et.`);}
 if(e.kind==='assignment'){add('scope',start,`${title} yönergesini aç ve teslim ölçütlerini listele.`);add('draft',Math.max(2,Math.floor(start/2)),`${title} için ilk bölümün taslağını yaz.`);add('final',1,`${title} dosyasını aç ve teslim sistemine yükle.`);}
 if(e.kind==='application'){
 if(!e.documents.length)add('requirements',e.prepDays??defaults.application??28,`${title} başvuru sayfasını aç ve istenen belgeleri listele.`);
 for(const d of e.documents){const i=[d.category,d.name,d.holder].join('|');if(d.status==='uploaded')continue;const name=d.name.slice(0,24),holder=d.holder.slice(0,24)||'ilgili kişiye';const offset=(days:number)=>e.prepDays!==null||defaults.application!==undefined?Math.min(days,start):days;
 if(d.status==='ready'){add('doc-'+i+'-upload',2,`${title} için ${name} belgesini portala yükle.`);continue;}
 if(d.category==='reference'){if(d.status==='todo'&&(!d.holder||d.holder==='ikinci referans hocası'))add('doc-'+i+'-choose',offset(28),'İkinci referans için aday 2 hocanın adını yaz.',true);if(d.status==='todo')add('doc-'+i+'-ask',offset(28),`${holder} için ${name} rica mailini yaz ve gönder.`,true);add('doc-'+i+'-remind',10,`${holder} için ${name} durumunu soran kısa maili gönder.`,true);add('doc-'+i+'-confirm',3,`${title} için ${name} belgesinin ulaştığını sor.`,true);}
 else if(d.category==='official'){if(d.status==='todo')add('doc-'+i+'-ask',offset(14),`${holder} için ${name} talep mesajını yaz ve gönder.`,true);}
 else if(d.category==='text'){add('doc-'+i+'-draft',offset(14),`${name} için ilk taslağın giriş paragrafını yaz.`);add('doc-'+i+'-revise',7,`${name} taslağındaki eksik gerekçeleri düzelt.`);add('doc-'+i+'-final',3,`${name} metninin son halini dosyaya kaydet.`);}
 else if(d.category==='cv')add('doc-'+i+'-cv',offset(10),`${title} için özgeçmiş dosyandaki son çalışmalarını ekle.`);
 else add('doc-'+i+'-other',offset(14),`${title} için ${name} gerekliliklerini aç ve listele.`);
 }
 if(!e.documents.some(d=>d.category==='official'))add('official-check',Math.min(14,start),`${title} portalındaki resmî belge koşullarını aç ve listele.`,true);
 if(!e.documents.some(d=>d.category==='text')){add('text-draft',Math.min(14,start),`${title} için istenen metinleri listele ve ilk paragrafı yaz.`);add('text-revision',7,`${title} metinlerinde eksik kalan gerekçeleri düzelt.`);add('text-final',3,`${title} metinlerinin son halini dosyaya kaydet.`);}
 if(!e.documents.some(d=>d.category==='cv'))add('cv-check',10,`${title} için özgeçmiş dosyandaki son çalışmalarını ekle.`);
 add('final',2,`${title} belgelerini portala yükle ve başvuruyu gönder.`);
 }
 const dense=denseDays(events);return steps.map(step=>{let due=addDays(e.date!,-step.days);if(step.key==='final'&&dense.has(e.date!))due=addDays(due,-1);while(dense.has(due))due=addDays(due,-1);if(due<today)due=today;while(dense.has(due))due=addDays(due,1); // A past start becomes actionable now; never schedule into the past.
 return {id:`prep:${e.id}:${step.key}`,text:step.text,eventId:e.id,prepareAt:due,dependent:step.dependent};}).sort((a,b)=>a.prepareAt!.localeCompare(b.prepareAt!)||Number(!!b.dependent)-Number(!!a.dependent));
}
export function syncPlans(s:State,today:string){const events=Object.values(s.events??{});for(const f of Object.values(s.fronts)){const completed=new Map(f.moves.filter(m=>m.doneAt).map(m=>[m.id,m]));const planned=events.filter(e=>e.frontId===f.id).flatMap(e=>prepPlan(e,events,today,s.prepDefaults));const existing=new Map(f.moves.map(m=>[m.id,m]));f.moves=[...f.moves.filter(m=>!m.eventId||m.doneAt),...planned.filter(m=>!completed.has(m.id)).map(m=>({...m,text:existing.get(m.id)?.text??m.text}))];}}
export function eventMail(c:Conflict,p:Profile){return `Sayın Hocam,\n\n${c.a.date} tarihinde ${c.a.time} saatindeki ${c.a.title} ile ${c.b.time} saatindeki ${c.b.title} çakışıyor. ${c.move.title} için aynı gün diğer etkinlikten sonraki uygun bir saate ya da başka bir güne geçmem mümkün müdür? Uygun gördüğünüz seçeneğe göre planımı güncelleyebilirim.\n\n${[p.name,p.number,p.department,p.university].filter(Boolean).join(' · ')}\n\nSaygılarımla,`;}
