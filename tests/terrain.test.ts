import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateCamps,loadTerrain,terrainRoute,fitView,urgency,dayLabel,WORLD,rippleContourPaths} from '../lib/terrain';
test('New camps preserve existing positions and enforce clearance without a count cap',()=>{
 const fronts=Array.from({length:160},(_,i)=>({id:'camp-'+i,type:(['lane','course','application','general'] as const)[i%4]}));
 const first=allocateCamps(fronts.slice(0,12)),all=allocateCamps(fronts,first);
 for(const [id,point] of Object.entries(first))assert.deepEqual(all[id],point);
 const points=Object.values(all).map(x=>x.point);assert.equal(points.length,160);
 for(let i=0;i<points.length;i++){assert.ok(Math.hypot(points[i][0]-WORLD.HQ[0],points[i][1]-WORLD.HQ[1])>=95);for(let j=0;j<i;j++)assert.ok(Math.hypot(points[i][0]-points[j][0],points[i][1]-points[j][1])>=58);}
});
test('Terrain paths keep endpoints, reverse consistently and route overflow camps',async()=>{
 const terrain=await loadTerrain();assert.ok(terrain.contours.some(c=>c.d.length>100));
 const a:[number,number]=[400,640],b:[number,number]=[320,160],path=terrainRoute(terrain,a,b);
 assert.deepEqual(path[0],a);assert.deepEqual(path.at(-1),b);assert.ok(path.length>3);assert.deepEqual(terrainRoute(terrain,b,a),[...path].reverse());
 const outside:[number,number]=[-460,1700],overflow=terrainRoute(terrain,b,outside);assert.deepEqual(overflow.at(-1),outside);assert.ok(overflow.every(p=>p.every(Number.isFinite)));
 const before=terrain.contours.map(c=>c.d);rippleContourPaths(terrain,b,400,true);assert.deepEqual(terrain.contours.map(c=>c.d),before);
});
test('Fit includes all camps and urgency uses deadlines without moving camps',()=>{
 const points:[number,number][]=[[-600,-800],[1500,2000]],view=fitView(points,390,600,110,80);
 for(const p of [...points,WORLD.HQ]){const x=p[0]*view.k+view.x,y=p[1]*view.k+view.y;assert.ok(x>0&&x<390&&y>0&&y<600);}
 assert.equal(urgency(2),'critical');assert.equal(urgency(7),'approaching');assert.equal(urgency(null),'calm');assert.equal(urgency(0,false,true),'done');assert.equal(dayLabel(0),'BUGÜN');assert.equal(dayLabel(1),'YARIN');
});
