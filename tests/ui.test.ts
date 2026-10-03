import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,commitChanges,type Front} from '../lib/domain';
import {act} from '../lib/reducer';
import {describeOp,breakdown,changeNotice} from '../lib/ledger';
import {type CalendarEvent} from '../lib/calendar';
import {reviewDue,reviewCard,reviewFronts,decisionOf} from '../lib/book';

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
