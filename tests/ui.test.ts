import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,commitChanges,type Front} from '../lib/domain';
import {act} from '../lib/reducer';
import {describeOp,breakdown,changeNotice} from '../lib/ledger';
import {type CalendarEvent} from '../lib/calendar';

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
