import {test} from 'node:test';
import assert from 'node:assert/strict';
import {C,geoSteps,runSteps,astar,regionCands,type Pt} from '../lib/expedition/terrain';
import {placeCamps,inRegion,CAMP_GAP,nextDated,urgency,daysTag,whenText} from '../lib/expedition/camps';
import {placeLabels,type Mark} from '../lib/expedition/labels';
import {fresh,type FrontType,type Front} from '../lib/domain';
import type {CalendarEvent} from '../lib/calendar';

const geo=runSteps(geoSteps());
const types:FrontType[]=['course','lane','application','general'];
const fronts=(n:number,offset=0)=>Array.from({length:n},(_,i)=>({id:`front-${i+offset}-${(i*7919).toString(36)}`,type:types[i%4]}));
const dist=(a:Pt,b:Pt)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

test('Terrain is deterministic',()=>{
 const again=runSteps(geoSteps());
 assert.equal(again.levels.length,geo.levels.length);
 assert.equal(again.levels.map(l=>l.d).join('|'),geo.levels.map(l=>l.d).join('|'));
 assert.equal(again.stipple,geo.stipple);
 assert.deepEqual(again.peaks,geo.peaks);
 assert.ok(geo.levels.length>20&&geo.peaks.length===3);
 assert.deepEqual(regionCands(again).map(([name,list])=>[name,list.length]),regionCands(geo).map(([name,list])=>[name,list.length]));
});

test('Camps stay in their region, keep their distance and do not move when a front is added',()=>{
 const list=fronts(20),pos=placeCamps(list);
 for(const f of list)assert.ok(inRegion(f.type,pos[f.id]),`${f.type} ${pos[f.id]}`);
 for(let i=0;i<list.length;i++){
  assert.ok(dist(pos[list[i].id],C.HQ)>=100);
  for(let j=0;j<i;j++)assert.ok(dist(pos[list[i].id],pos[list[j].id])>=CAMP_GAP,`${list[i].id} ${list[j].id}`);
 }
 assert.deepEqual(placeCamps(list),pos);
 const more=placeCamps([...list,...fronts(3,100)]);
 for(const f of list)assert.deepEqual(more[f.id],pos[f.id]);
});

test('There is room for any number of fronts',()=>{
 const list=fronts(90),pos=placeCamps(list);
 assert.equal(Object.keys(pos).length,90);
 for(const f of list){const [x,y]=pos[f.id];assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&x>C.X0&&x<C.X1&&y>C.Y0&&y<C.Y1);}
});

test('Urgency comes from the nearest dated item; classes, weekly, cancelled and past items do not count',()=>{
 const today='2026-09-26',s=fresh();
 const event=(id:string,frontId:string,date:string,extra:Partial<CalendarEvent>={}):CalendarEvent=>({id,title:id,kind:'assignment',frontId,date,time:null,endTime:null,location:'',bring:[],weekly:false,prepDays:null,documents:[],institution:'',program:'',portal:'',...extra});
 s.events={
  a:event('a','f','2026-09-28'),b:event('b','f','2026-10-20'),
  c:event('c','g','2026-09-27',{kind:'class'}),d:event('d','g','2026-09-26',{weekly:true,kind:'lab'}),e:event('e','g','2026-09-29',{cancelled:true}),p:event('p','g','2026-09-20'),
  n:event('n','n','2026-10-03'),m:event('m','m','2026-10-04'),
 };
 const front=(status:Front['status']='active')=>({status});
 assert.equal(nextDated(s,'f',today)?.days,2);
 assert.equal(nextDated(s,'g',today),null);
 assert.equal(urgency(front(),nextDated(s,'f',today)!.days,false),'crit');
 assert.equal(urgency(front(),nextDated(s,'n',today)!.days,false),'near');
 assert.equal(urgency(front(),nextDated(s,'m',today)!.days,false),'calm');
 assert.equal(urgency(front('held'),0,false),'calm');
 assert.equal(urgency(front(),null,false),'calm');
 assert.equal(urgency(front(),0,true),'done');
 assert.deepEqual([0,1,2,5].map(d=>daysTag(front(),d)),['BUGÜN','YARIN','2 GÜN','5 GÜN']);
 assert.equal(daysTag(front(),null),'TARİHSİZ');
 assert.equal(daysTag(front('held'),3),'BEKLETİLİYOR');
 assert.equal(whenText({date:'2026-09-29',time:'10:00'}),'Sal 29 Eyl · 10:00');
 assert.equal(whenText({date:'2026-10-16',time:null}),'Cum 16 Eki');
});

test('Paths start at the headquarters and end at the camp',()=>{
 const pos=placeCamps(fronts(8));
 let a=C.HQ;
 for(const b of Object.values(pos)){
  const path=astar(geo,a,b);
  assert.deepEqual(path[0],a);
  assert.deepEqual(path.at(-1),b);
  assert.ok(path.length>2);
  a=b;
 }
});

test('Labels do not overlap and forced labels always get a place',()=>{
 const marks:Mark[]=[{x:200,y:180,r:30},{x:100,y:100,r:22,w:120,h:39,prio:60},{x:300,y:260,r:22,w:120,h:39,prio:93,force:true},{x:310,y:250,r:22,w:90,h:39,prio:50}];
 const {api}=placeLabels(marks,390,360,[[330,0,390,150]]);
 assert.ok(marks[2].lab);
 const boxes=api.placed;
 for(let i=0;i<boxes.length;i++)for(let j=0;j<i;j++){const [p,q]=[boxes[i],boxes[j]];assert.ok(!(p[0]<q[2]&&p[2]>q[0]&&p[1]<q[3]&&p[3]>q[1]));}
});
