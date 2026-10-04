import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,undo,type State,type Front,type Dictation,type Order,type Slot} from '../lib/domain';
import {act} from '../lib/reducer';
import {catchConflicts,type CalendarEvent} from '../lib/calendar';
import {buildReport,pendingQuestions,answerOf} from '../lib/report';
import {logbook,expeditionWindow,staleSummaries,completedOn,sourceHash,plainSummary} from '../lib/logbook';
import {atTime,possessive,longDay} from '../lib/turkish';

// The design's sample morning: Saturday 26 September 2026, 08:00 in Istanbul.
const NOW=new Date('2026-09-26T05:00:00Z'),DAY='2026-09-26';
const at=(day:string,time:string)=>new Date(`${day}T${time}${time.length===5?':00':''}+03:00`).toISOString();
const plus=(n:number)=>new Date(Date.parse(DAY+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const front=(id:string,title:string,type:Front['type'],moves:{id:string;text:string;doneAt?:string;eventId?:string}[]=[],extra:Partial<Front>={}):Front=>({id,title,type,status:'active',moves:moves.length?moves:[{id:id+'-m1',text:`${title} için sıradaki adımı yaz.`}],where:'',question:'',notes:[],touched:at(plus(-1),'10:00'),...extra});
const event=(id:string,title:string,kind:CalendarEvent['kind'],frontId:string|null,date:string|null,extra:Partial<CalendarEvent>={}):CalendarEvent=>({id,title,kind,frontId,date,time:null,endTime:null,location:'',bring:[],weekly:false,prepDays:null,documents:[],institution:'',program:'',portal:'',...extra});
const slot=(f:Front,i=0,doneAt?:string):Slot=>({frontId:f.id,moveId:f.moves[i].id,text:f.moves[i].text,reason:'Tarihli kalemin hazırlık zamanı geldi.',...(doneAt?{doneAt}:{})});

function busyDay():{s:State;dictations:Dictation[]}{
 const s=fresh();s.setup=true;
 const era=front('era','Erasmus+ başvurusu','application',[{id:'era-m1',text:'Ayşe Hoca’ya referans ricası mailini gönder.'}]);
 const kar=front('kar','Kargo iadesi','general',[{id:'kar-m1',text:'İade paketini PTT şubesine götür.'}]);
 const bio=front('bio','Biyokimya','course',[{id:'bio-m1',text:'Sunumun ilk beş slaytını hazırla.'}]);
 const dek=front('dek','Dekanlık imzası','general');
 const mik=front('mik','Mikrobiyom derlemesi','lane',[{id:'mik-m1',text:'13. makaleyi oku ve tabloya ekle.'}],{where:'Literatür tablosunda 12. makalede kaldın'});
 for(const f of [era,kar,bio,dek,mik])s.fronts[f.id]=f;
 s.events={
  e5:event('e5','Erasmus+ son başvuru','application','era',plus(4),{time:'23:59',institution:'Erasmus+',documents:[
   {name:'Referans 1',holder:'Ayşe Hoca',status:'requested',category:'reference'},{name:'Referans 2',holder:'',status:'todo',category:'reference'},
   {name:'Transkript',holder:'Öğrenci işleri',status:'ready',category:'official'},{name:'Niyet mektubu',holder:'',status:'todo',category:'text'},
   {name:'Özgeçmiş',holder:'',status:'uploaded',category:'cv'}]}),
  e8:event('e8','Son iade günü','appointment','kar',DAY,{location:'PTT şubesi',bring:['İade paketi','kimlik kartı']}),
  e9:event('e9','Dekanlık randevusu','appointment','dek',plus(2),{time:'14:00',location:'Dekanlık'}),
  e10:event('e10','Organik Kimya Lab','lab',null,plus(2),{time:'13:00',endTime:'16:00',location:'Lab 3',weekly:true}),
  e11:event('e11','Reuteri ikinci parti 48. saat ölçümü','lab',null,plus(1),{time:'11:00',location:'Laboratuvar B-204',bring:['laboratuvar defteri','pH kalibrasyon tamponları']}),
  e12:event('e12','Haftalık ders','class',null,DAY,{time:'09:00',location:'Amfi 2',weekly:true}),
 };
 s.orders[DAY]={date:DAY,slots:[slot(era),slot(kar),slot(bio),{...slot(mik),reason:'Bu hafta aktif seçtiğin kulvar.'}]};
 const question:Dictation={id:'q1',raw:'Biyokimya sunumu için not',context:'bio',created_at:at(plus(-1),'21:00'),status:'question',result:JSON.stringify({question:'Biyokimya sunumu ile Biyokimya aynı cephe mi?'})};
 return {s,dictations:[question]};
}

test('Turkish suffixes follow how the number is read aloud',()=>{
 assert.deepEqual(['08:00','02:14','08:30','15:40','10:12','18:09','00:00','16:55'].map(atTime),['08:00’de','02:14’te','08:30’da','15:40’ta','10:12’de','18:09’da','00:00’da','16:55’te']);
 assert.deepEqual([1,2,3,4,5,6,9,10,40,100].map(possessive),['i','si','ü','ü','i','sı','u','u','ı','ü']);
 assert.equal(longDay(DAY),'CMT 26 EYLÜL');
});

test('A busy morning fills the four sections in a fixed order',()=>{
 const {s,dictations}=busyDay();s.conflictCaughtAt={};
 const caughtState=structuredClone(s);delete caughtState.events!.e9;catchConflicts(caughtState,s,new Date(at(DAY,'02:14')));
 const r=buildReport(s,dictations,[],NOW);
 assert.equal(r.header,'CMT 26 EYLÜL · 08:00’DE HAZIRLANDI');
 assert.deepEqual(r.counts,[4,2,2,2]);
 assert.equal(r.path,'Güzergâh: Karargâh → Başvuru Geçidi → İş Düzlüğü → Ders Ovası → Proje Dağları');
 assert.deepEqual(r.rows.map(x=>[x.num,x.head,x.chip,x.tone]),[['01','Erasmus+ başvurusu · Başvuru Geçidi','4 GÜN','near'],['02','Kargo iadesi · İş Düzlüğü','BUGÜN','crit'],['03','Biyokimya · Ders Ovası','TARİHSİZ','calm'],['04','Mikrobiyom derlemesi · Proje Dağları','TARİHSİZ','calm']]);
 assert.equal(r.rows[0].why,'Erasmus+ son başvuru Çar 30 Eyl 23:59.');
 assert.equal(r.rows[1].why,'Son iade günü bugün.');
 assert.equal(r.rows[3].why,'Bu hafta aktif seçtiğin kulvar. Kaldığın yer: Literatür tablosunda 12. makalede kaldın.');
 const [conflict,prep]=r.warnings;
 assert.equal(conflict.label,'SAAT ÇAKIŞMASI');assert.equal(conflict.meta,'02:14’TE YAKALANDI');
 assert.equal(conflict.text,'Pzt 28 Eyl 14:00 Dekanlık randevusu, 13:00–16:00 Organik Kimya Lab ile çakışıyor.');
 assert.equal(prep.label,'HAZIRLIK DARALIYOR');assert.equal(prep.meta,'ERASMUS+','an application is named by its institution');
 assert.equal(prep.text,'Son başvuruya 4 gün kaldı. Gerekli 5 belgeden 2’si hazır.');assert.equal(prep.action,'Belgeleri gör');
 assert.deepEqual(r.days.map(d=>d.when),['BUGÜN · CMT 26 EYL','YARIN · PAZ 27 EYL']);
 assert.deepEqual(r.days[0].places.map(p=>[p.title,p.context,p.bring]),[['PTT şubesi','Kargo iadesi · Son iade günü','İade paketi, kimlik kartı']],'class sessions stay out');
 assert.equal(r.days[1].places[0].when,'YARIN · PAZ 27 EYL · 11:00');
 assert.deepEqual(r.questions.map(q=>[q.label,q.choices]),[['SORU · BİYOKİMYA',['Evet','Hayır']]]);
 // The draft asks to move the conflict's movable item, as the mail itself does (calendar.ts).
 assert.deepEqual(r.drafts.map(d=>[d.label,d.text]),[['MAİL TASLAĞI · ORGANİK KİMYA LAB','Organik Kimya Lab için saat değişikliği ricası taslağı hazır.']]);
 assert.equal(r.next,'RAPORUN SONU · SIRADAKİ RAPOR PAZ 27 EYL 08:30');
});

test('A quiet morning keeps every section and says there is nothing',()=>{
 const s=fresh();s.setup=true;const r=buildReport(s,[],[],NOW);
 assert.deepEqual(r.counts,[0,0,0,0]);assert.equal(r.rows.length,0);assert.equal(r.warnings.length,0);
 assert.deepEqual(r.days.map(d=>[d.when,d.places.length]),[['BUGÜN · CMT 26 EYL',0],['YARIN · PAZ 27 EYL',0]]);
 assert.equal(r.questions.length+r.drafts.length,0);
});

test('Seen warnings stay dimmed today, can be taken back and drop out tomorrow',()=>{
 const {s,dictations}=busyDay(),conflictId=buildReport(s,dictations,[],NOW).warnings[0].id;
 // act() stamps the real clock; the sample morning needs the stamp on its own day.
 const stamp=(state:State,id:string)=>{state.seenWarnings![id]=at(DAY,'08:10');return state;};
 let seen=stamp(act(s,{id:'a',kind:'seenConflict',conflictId}),conflictId);
 let r=buildReport(seen,dictations,[],NOW);
 assert.deepEqual([r.warnings[0].seen,r.warnings[0].meta],[true,'GÖRÜLDÜ']);assert.equal(r.drafts.length,0,'a seen conflict has no waiting draft');
 assert.equal(buildReport(seen,dictations,[],new Date(Date.parse(NOW.toISOString())+86400000)).warnings.filter(w=>w.kind==='conflict').length,0);
 seen=act(seen,{id:'b',kind:'seenConflict',conflictId,seen:false});r=buildReport(seen,dictations,[],NOW);
 assert.equal(r.warnings[0].seen,false);assert.equal(r.drafts.length,1);
 const prepId=r.warnings[1].id;seen=stamp(act(seen,{id:'c',kind:'seenWarning',warningId:prepId}),prepId);
 assert.equal(buildReport(seen,dictations,[],NOW).warnings[1].meta,'GÖRÜLDÜ');
 seen=act(seen,{id:'d',kind:'seenWarning',warningId:prepId,seen:false});
 assert.equal(buildReport(seen,dictations,[],NOW).warnings[1].seen,false);
});

test('Preparation narrows only late in its window and only when the work lags behind',()=>{
 const base=fresh(),f=front('ist','İstatistik','course',[{id:'p1',text:'Konuları listele.',eventId:'ex'},{id:'p2',text:'Örnek soru çöz.',eventId:'ex'},{id:'p3',text:'Yanlışları yeniden çöz.',eventId:'ex'}]);base.fronts.ist=f;
 const warn=(days:number,done:number)=>{const s=structuredClone(base);s.events={ex:event('ex','İstatistik vizesi','exam','ist',plus(days))};s.fronts.ist.moves.forEach((m,i)=>{if(i<done)m.doneAt=at(plus(-1),'10:00');});return buildReport(s,[],[],NOW).warnings.find(w=>w.kind==='prep');};
 assert.equal(warn(9,0),undefined,'first half of the window');
 assert.equal(warn(4,1)?.text,'Sınava 4 gün kaldı. Hazırlık planındaki 3 hamleden 1’i tamamlandı.');
 assert.equal(warn(4,2),undefined,'the work left fits the time left');
 assert.equal(warn(1,0)?.text,'Sınav yarın. Hazırlık planındaki 3 hamlenin hiçbiri henüz tamamlanmadı.');
});

test('A conflict is caught once, when it first appears',()=>{
 const before=busyDay().s;delete before.events!.e9;const after=busyDay().s;
 catchConflicts(before,after,new Date(at(DAY,'02:14')));
 assert.deepEqual(Object.values(after.conflictCaughtAt??{}),[at(DAY,'02:14')]);
 const later=structuredClone(after);later.events!.e11.location='B-205';catchConflicts(after,later,new Date(at(DAY,'09:00')));
 assert.deepEqual(later.conflictCaughtAt,after.conflictCaughtAt,'an old conflict keeps its time');
});

test('An answer can be taken back and the question opens again',()=>{
 const {s}=busyDay(),q:Dictation={id:'q1',raw:'not',context:'bio',created_at:at(DAY,'07:00'),status:'answered',result:JSON.stringify({question:'Biyokimya sunumu ile Biyokimya aynı cephe mi?'})};
 const reply:Dictation={id:'r1',raw:'Evet',context:'bio',created_at:at(DAY,'08:05'),status:'done',result:JSON.stringify({replyTo:'q1'})};
 s.changes.push({id:'c1',label:'Cepheler eşleşti',at:at(DAY,'08:06'),sourceId:'r1',ops:[{key:'setup',before:false,after:true}]});
 assert.equal(pendingQuestions([q,reply],[],s.changes).length,0);
 assert.equal(answerOf(q,[q,reply],[],s.changes)?.text,'Evet');
 assert.equal(buildReport(s,[q,reply],[],NOW).questions[0].answer?.change?.id,'c1','answered today, shown with Geri al');
 const back=undo(s,'c1');
 assert.deepEqual(pendingQuestions([q,reply],[],back.changes).map(d=>d.id),['q1']);
 assert.equal(answerOf(q,[q],[{replyTo:'q1',text:'Hayır'}],[])?.pending,true,'an answer in the device queue counts at once');
});

test('Opening the report or approving starts the expedition; the first opening time stays',()=>{
 let s=fresh();s=act(s,{id:'1',kind:'reportOpen'});
 const first=s.metrics?.reportOpenedAt?.[Object.keys(s.metrics!.reportOpenedAt!)[0]];assert.ok(first&&s.expedition?.startedAt);
 const again=act(s,{id:'2',kind:'reportOpen'});assert.equal(Object.values(again.metrics!.reportOpenedAt!)[0],first);
 assert.equal(again.changes.length,0,'not a user change');
 const approved=act(fresh(),{id:'3',kind:'approve'});assert.ok(approved.expedition?.startedAt);
});

test('Closing a front records the day; reopening clears it',()=>{
 let s=fresh();s.fronts.f=front('f','Ders ekle-bırak','general');
 s=act(s,{id:'1',kind:'status',frontId:'f',status:'closed'});assert.ok(s.fronts.f.closedAt);
 s=act(s,{id:'2',kind:'status',frontId:'f',status:'active'});assert.equal(s.fronts.f.closedAt,undefined);
});

function expedition():State{
 // Six days of the design's logbook: 18 camps taken out of 23, two fronts closed, three reorders.
 const s=fresh();s.expedition={startedAt:'2026-09-21'};s.metrics={reportOpenedAt:{}};
 const plan:[string,number,number,string?][]=[['2026-09-21',4,3,'08:02:40'],['2026-09-22',3,3,'08:03:00'],['2026-09-24',5,4,'08:02:20'],['2026-09-25',5,5],[DAY,6,3]];
 for(const [day,count,done,approved] of plan){
  const slots:Slot[]=[];
  for(let i=0;i<count;i++){const f=front(`${day}-${i}`,`Cephe ${day.slice(8)}-${i}`,'general',[{id:`${day}-${i}-m`,text:`Hamle ${i}`,...(i<done?{doneAt:at(day,`1${i}:00`)}:{})}]);s.fronts[f.id]=f;slots.push(slot(f,0,i<done?at(day,`1${i}:00`):undefined));}
  const o:Order={date:day,slots};if(approved){o.approvedAt=at(day,approved);s.metrics.reportOpenedAt![day]=at(day,'08:00');}s.orders[day]=o;
 }
 s.fronts.closed1=front('closed1','Ders ekle-bırak','general',[],{status:'closed',closedAt:at('2026-09-22','15:00')});
 s.fronts.closed2=front('closed2','Öğrenci kimliği yenileme','general',[],{status:'closed',closedAt:at('2026-09-24','12:00')});
 for(const id of ['r1','r2','r3'])s.changes.push({id,label:'Rotanın sırası değiştirildi',at:at('2026-09-24','09:00'),ops:[{key:'order:x',before:null,after:null}]});
 return s;
}

test('The logbook window, its cells, day records and totals',()=>{
 const s=expedition(),l=logbook(s,DAY);
 assert.equal(l.sub,'İKİ HAFTALIK SEFER · 6. GÜN / 14 · 21 EYL – 4 EKİ');
 assert.deepEqual(l.cells.map(c=>c.state),['past','past','zero','past','past','today','future','future','future','future','future','future','future','future']);
 assert.deepEqual(l.cells.map(c=>c.n).slice(8,11),['29','30','1']);
 assert.deepEqual([l.camps,l.closed],[18,2]);
 assert.deepEqual(l.entries.map(e=>[e.date,e.tag]),[['CMT 26 EYL · BUGÜN','SÜRÜYOR'],['CUM 25 EYL','SEFER TAMAMLANDI'],['PER 24 EYL',''],['ÇAR 23 EYL','KARARGÂHTA'],['SAL 22 EYL','SEFER TAMAMLANDI'],['PZT 21 EYL','1. GÜN']]);
 assert.deepEqual(l.entries[0].nodes,[true,true,true,false,false,false]);
 assert.equal(l.entries[3].text,'Bu gün için emir yoktu.');
 assert.deepEqual(l.entries.find(e=>e.day==='2026-09-24')?.closed,['Öğrenci kimliği yenileme']);
 assert.deepEqual(l.metrics.map(m=>m.value),['%78 · 18/23','ort. 2 dk 40 sn','3 · 0']);
 assert.equal(l.metrics[2].note,'3 sıra düzenlemesi, 0 ayar değişikliği. Hedef sıfıra yakın.');
 assert.equal(logbook(fresh(),DAY).window,null);
 const later=expeditionWindow(s,'2026-10-06');assert.deepEqual([later?.start,later?.index],['2026-10-05',2],'the next two weeks follow');
});

test('Day records use a written summary only while it matches the day',()=>{
 const s=expedition(),stale=staleSummaries(s,DAY);
 assert.deepEqual(stale.map(x=>x.day),['2026-09-21','2026-09-22','2026-09-24','2026-09-25',DAY]);
 assert.equal(logbook(s,DAY).entries[1].text,plainSummary(completedOn(s,'2026-09-25')));
 s.logbook={'2026-09-25':{summary:'Beş cephede hamle tamamlandı.',hash:sourceHash(completedOn(s,'2026-09-25'),false),at:at('2026-09-25','23:00')}};
 assert.equal(logbook(s,DAY).entries[1].text,'Beş cephede hamle tamamlandı.');
 assert.ok(!staleSummaries(s,DAY).some(x=>x.day==='2026-09-25'));
 s.fronts['2026-09-25-0'].moves[0].text='Başka hamle';
 assert.ok(staleSummaries(s,DAY).some(x=>x.day==='2026-09-25'),'a changed day is written again');
 assert.equal(plainSummary([{front:'A',move:'x',at:''},{front:'B',move:'y',at:''},{front:'A',move:'z',at:''}]),'Hamlesi tamamlanan cepheler: A ve B.');
});
