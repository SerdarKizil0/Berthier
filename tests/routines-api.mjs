import assert from 'node:assert/strict';
// Rutinler through the compiled Worker (npm run start -- --port 5174), on the seeded QA identity only.
// A front becomes a routine (retype), the pattern is approved, a timer runs, a day is put off, and every
// change is taken back at the end, newest first.
const base='http://127.0.0.1:5174';
const headers={'oai-authenticated-user-id':'berthier-qa','oai-authenticated-user-email':'qa@berthier.invalid','Content-Type':'application/json',Origin:base};
async function read(){const r=await fetch(base+'/api/state',{headers});assert.equal(r.status,200);return r.json();}
async function command(body,status=200){const r=await fetch(base+'/api/state',{method:'POST',headers,body:JSON.stringify({id:crypto.randomUUID(),...body})});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
let data=await read();const front=Object.values(data.state.fronts).find(f=>f.status!=='closed');assert.ok(front,'Seed QA fixture first');
const first=data.state.changes.length;
await command({kind:'retype',frontId:front.id,type:'routine'},503);
await command({kind:'routineTrial',trial:'sometimes'},400);
data=await command({kind:'retype',frontId:front.id,type:'routine',count:7});
const r=Object.values(data.state.routines).find(x=>x.title===front.title);assert.equal(r.status,'observing');assert.equal(data.state.fronts[front.id].status,'closed');assert.equal(data.summary,'Cephe türü değiştirildi');
await command({kind:'routineReminder',routineId:r.id,on:true},503);
data=await command({kind:'routinePatternAll',patterns:[{routineId:r.id,days:[0,1,2,3,4,5,6],time:'23:50'}],reminder:'all'});assert.equal(data.state.routines[r.id].status,'settled');assert.equal(data.state.routines[r.id].reminder.on,true);
const start={id:crypto.randomUUID(),kind:'routineStart',routineId:r.id};
data=await command(start);assert.equal(data.state.running.routineId,r.id);
const again=await command(start);assert.equal(again.replayed,true,'the same request id is applied once');
await command({kind:'routineStart',routineId:r.id},503);
data=await command({kind:'routineFinish',minutes:12});assert.equal(data.state.running,null);const x=data.state.sessions.at(-1);assert.deepEqual([x.minutes,x.source],[12,'timer']);
data=await command({kind:'routineEdit',sessionId:x.id,minutes:15});assert.equal(data.state.sessions.at(-1).minutes,15);
data=await command({kind:'routineLog',routineId:r.id});assert.equal(data.state.sessions.at(-1).source,'tap');
data=await command({kind:'routineTimer',routineId:r.id,on:false});assert.equal(data.state.routines[r.id].timer,false);
data=await command({kind:'routinePause',routineId:r.id,paused:true});assert.equal(data.state.routines[r.id].status,'paused');
data=await command({kind:'routinePause',routineId:r.id,paused:false});assert.equal(data.state.routines[r.id].status,'settled');
for(const c of data.state.changes.slice(first).reverse())data=await command({kind:'undo',changeId:c.id});
assert.equal(data.state.routines?.[r.id],undefined);assert.equal(data.state.fronts[front.id].status,front.status);assert.equal(data.state.fronts[front.id].type,front.type);
console.log('API: retype to a routine, pattern approval, timer with idempotency, corrections, one tap, pause and undo passed.');
