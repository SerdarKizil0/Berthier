import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,commitChanges,undo,type Front} from '../lib/domain';
import {act} from '../lib/reducer';
import {describeOp,breakdown,changeNotice,ledgerDays,undoBlock} from '../lib/ledger';
import {type CalendarEvent} from '../lib/calendar';
import {reviewDue,reviewCard,reviewFronts,decisionOf} from '../lib/book';
import {untilTime} from '../lib/turkish';

// Design review (2 Oct): the status card and the change log say what a change did in the user's words.
const front=(id:string,title:string,type:Front['type'],moves=[{id:id+'-m1',text:`${title} için sıradaki adımı yaz.`}]):Front=>({id,title,type,status:'active',moves,where:'',question:'',notes:[],touched:'2026-09-25T10:00:00.000Z'});
const event=(id:string,title:string,frontId:string,date:string):CalendarEvent=>({id,title,kind:'assignment',frontId,date,time:null,endTime:null,location:'PTT Kadıköy şubesi',bring:['iade paketi'],weekly:false,prepDays:null,documents:[],institution:'',program:'',portal:''});

test('a dictation’s change counts new fronts, moves and dates', ()=>{
 let s=fresh();s.fronts.bio=front('bio','Biyokimya','course');
 s=commitChanges(s,'Dikte işlendi',n=>{n.fronts.kar=front('kar','Kargo iadesi','general',[{id:'k1',text:'İade paketini PTT şubesine götür.'}]);n.fronts.bio.moves.push({id:'b2',text:'Sunumun ilk beş slaytını hazırla.'});n.events={e1:event('e1','Son iade günü','kar','2026-09-27')};});
 const c=s.changes.at(-1)!;c.sourceId='d1';
 assert.equal(breakdown(c,s.fronts),'1 yeni cephe, 1 hamle, 1 tarih.');
 assert.deepEqual(changeNotice(c,s.fronts),{title:'3 değişiklik.',text:'1 yeni cephe, 1 hamle, 1 tarih.'});
 const lines=c.ops.map(o=>describeOp(o,s.fronts));
 assert.ok(lines.some(l=>l.tag==='YENİ HAMLE'&&l.text==='Biyokimya: Sunumun ilk beş slaytını hazırla.'));
 assert.ok(lines.some(l=>l.tag==='TARİH'&&l.text==='Son iade günü, Paz 27 Eyl'));
 assert.ok(lines.some(l=>l.tag==='YENİ CEPHE'&&l.text==='Kargo iadesi'));
});

test('an action names itself; undone operations are not counted', ()=>{
 let s=fresh();s.setup=true;s.fronts.a=front('a','Erasmus+ başvurusu','application');s.fronts.b=front('b','Tez önerisi','lane');
 s=act(s,{id:'x1',kind:'approve'});
 assert.deepEqual(changeNotice(s.changes.at(-1)!,s.fronts),{title:'Günün emri onaylandı.',text:''});
 s=act(s,{id:'x2',kind:'select',ids:['a']});
 const select=s.changes.at(-1)!;
 assert.equal(describeOp(select.ops[0],s.fronts).text,'Tez önerisi çıkarıldı.');
 s=act(s,{id:'x3',kind:'undo',changeId:select.id});
 assert.equal(breakdown(s.changes.find(c=>c.id===select.id)!,s.fronts),'');
});

test('the review card knows when the review is due and what it holds', ()=>{
 const s=fresh();s.fronts.tez={...front('tez','Tez önerisi','lane'),status:'held',touched:'2026-08-22T10:00:00.000Z'};
 s.ideas={i1:{id:'i1',text:'Laboratuvar seç',kind:'question',laneId:null,createdAt:'2026-09-20T10:00:00.000Z',sourceId:null,status:'stored'}};
 const sat=new Date('2026-09-26T07:00:00Z'),sun=new Date('2026-09-27T17:30:00Z'),mon=new Date('2026-09-28T09:00:00Z'),wed=new Date('2026-09-30T09:00:00Z');
 assert.equal(reviewDue(s,sat),false);
 assert.deepEqual(reviewCard(s,sat),{open:false,label:'HAFTALIK TEFTİŞ',when:'YARIN 20:00',title:'Haritaya birlikte bakalım.',meta:'5 adım · 1 bayat cephe · 1 yeni fikir',action:'Şimdi başlat'});
 assert.equal(reviewDue(s,sun),true);assert.equal(reviewCard(s,sun).when,'ZAMANI GELDİ');
 assert.equal(reviewDue(s,mon),true);assert.equal(reviewDue(s,wed),false);
 // Done on Saturday, it is not asked again on Sunday evening.
 assert.equal(reviewDue({...s,review:{id:'r',step:4,startedAt:'2026-09-26T08:00:00.000Z',completedAt:'2026-09-26T08:20:00.000Z',decisions:[]}},sun),false);
});

test('review decisions show on their card and finishing keeps untouched items as seen', ()=>{
 let s=fresh();s.fronts.tez={...front('tez','Tez önerisi','lane'),status:'held',touched:'2026-08-22T10:00:00.000Z'};s.fronts.gen={...front('gen','Moleküler Genetik','course'),touched:'2026-09-14T10:00:00.000Z'};
 s.ideas={i1:{id:'i1',text:'Laboratuvar seç',kind:'question',laneId:null,createdAt:'2026-09-20T10:00:00.000Z',sourceId:null,status:'stored'}};
 s=act(s,{id:'a',kind:'reviewStart'});
 s=act(s,{id:'b',kind:'status',frontId:'tez',status:'closed'});
 s=act(s,{id:'c',kind:'reviewContinue',frontId:'gen'});
 const cards=reviewFronts(s,new Date());
 assert.deepEqual(cards.map(c=>[c.front.id,c.decision]),[['gen','continue'],['tez','close']]);
 assert.equal(decisionOf(s,s.fronts.tez),'close');
 s=act(s,{id:'d',kind:'reviewFinish'});
 assert.ok(s.ideas!.i1.reviewedAt);assert.equal(s.ideas!.i1.status,'stored');
 assert.equal(s.changes.at(-1)!.label,'Teftiş tamamlandı');
});

test('saving the lane selection keeps a lane closed in the review closed', ()=>{
 let s=fresh();s.fronts.tez=front('tez','Tez önerisi','lane');s.fronts.lab={...front('lab','Laboratuvar','lane'),status:'held'};s.fronts.dil=front('dil','Almanca','lane');
 s=act(s,{id:'a',kind:'reviewStart'});
 s=act(s,{id:'b',kind:'status',frontId:'tez',status:'closed'});
 s=act(s,{id:'c',kind:'setup',ids:['lab']});
 assert.deepEqual(['tez','lab','dil'].map(id=>s.fronts[id].status),['closed','active','held']);
 // Choosing a closed lane on purpose still opens it.
 s=act(s,{id:'d',kind:'setup',ids:['tez']});
 assert.deepEqual(['tez','lab','dil'].map(id=>s.fronts[id].status),['active','held','held']);
});

test('a clock time takes the dative as it is read aloud', ()=>{
 assert.deepEqual(['17:00','16:00','14:00','10:30','20:00','19:00','13:00'].map(untilTime),['17:00’ye','16:00’ya','14:00’e','10:30’a','20:00’ye','19:00’a','13:00’e']);
});

test('the change log groups by day, keeps a dictation with its changes and says why an undo waits', ()=>{
 let s=fresh();s.setup=true;s.fronts.a=front('a','Kargo iadesi','general');
 s=commitChanges(s,'Dikte işlendi',n=>{n.fronts.a.moves.push({id:'a2',text:'İade paketini PTT şubesine götür.'});});
 const said=s.changes.at(-1)!;said.sourceId='d1';said.at='2026-09-25T19:17:00.000Z';
 s=act(s,{id:'x1',kind:'edit',frontId:'a',text:'İade paketini Kadıköy PTT şubesine götür.'});s.changes.at(-1)!.at='2026-09-26T05:41:00.000Z';
 s=act(s,{id:'x2',kind:'status',frontId:'a',status:'closed'});s.changes.at(-1)!.at='2026-09-26T07:12:00.000Z';
 const dictations=[{id:'d1',raw:'Yarın kargo iadesini unutma',context:null,created_at:'2026-09-25T19:17:00.000Z',status:'done',result:'{}'}];
 const days=ledgerDays(s,dictations,new Date('2026-09-26T09:00:00Z'));
 assert.deepEqual(days.map(d=>d.label),['BUGÜN · CMT 26 EYL','DÜN · CUM 25 EYL']);
 assert.equal(days[1].items[0].kind,'dictation');assert.equal(days[1].items[0].change?.id,said.id);
 assert.equal(days[0].items.length,2);
 const edit=s.changes.find(c=>c.label==='Hamle düzenlendi')!;
 assert.equal(undoBlock(s,edit),'Önce 10:12’deki değişikliği geri al.');
 assert.equal(undoBlock(s,s.changes.at(-1)!),null);
});

test('rhythm settings are saved, validated and undone like any change', ()=>{
 let s=fresh();
 s=act(s,{id:'r1',kind:'rhythm',rhythm:{report:'09:00',reviewDay:6,reviewTime:'18:30',quietFrom:'23:30',quietTo:'07:00'}});
 assert.equal(s.rhythm?.reviewDay,6);assert.equal(s.changes.at(-1)!.label,'Ritim ayarı değiştirildi');
 assert.equal(reviewCard(s,new Date('2026-09-26T07:00:00Z')).when,'BUGÜN 18:30');
 assert.throws(()=>act(s,{id:'r2',kind:'rhythm',rhythm:{report:'25:00',reviewDay:0,reviewTime:'20:00',quietFrom:'23:00',quietTo:'07:30'}}));
 s=undo(s,s.changes.at(-1)!.id);assert.equal(s.rhythm,undefined);
});
