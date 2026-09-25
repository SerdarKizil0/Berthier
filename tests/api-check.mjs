import assert from 'node:assert/strict';
const base='http://127.0.0.1:5174';
const headers={'oai-authenticated-user-id':'berthier-qa','oai-authenticated-user-email':'qa@berthier.invalid','Content-Type':'application/json',Origin:base};
async function read(){const r=await fetch(base+'/api/state',{headers});assert.equal(r.status,200);return r.json();}
async function command(body,status=200){const r=await fetch(base+'/api/state',{method:'POST',headers,body:JSON.stringify({id:crypto.randomUUID(),...body})});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
assert.equal((await fetch(base+'/api/state')).status,401);
assert.equal((await fetch(base+'/api/state',{method:'POST',headers:{...headers,Origin:'https://example.invalid'},body:'{}'})).status,403);
await command({kind:'untrusted-operation'},400);
let data=await read();const front=Object.values(data.state.fronts)[0];assert.ok(front,'Seed QA fixture first');
await command({kind:'setup',ids:[]});
await command({kind:'select',ids:[]});
data=await command({kind:'approve'});assert.equal(Object.values(data.state.orders).at(-1).slots.length,0);
data=await command({kind:'select',ids:[front.id]});const before=structuredClone(data.state);
const completeId=crypto.randomUUID();data=await command({id:completeId,kind:'complete',frontId:front.id,skip:true});assert.ok(data.state.fronts[front.id].moves[0].doneAt);assert.equal(data.state.fronts[front.id].moves[1].doneAt,undefined);
const once=JSON.stringify(data.state);data=await command({id:completeId,kind:'complete',frontId:front.id,skip:true});assert.equal(JSON.stringify(data.state),once,'retry must not complete another move');
data=await command({kind:'undo',changeId:data.state.changes.at(-1).id});assert.deepEqual(data.state.fronts,before.fronts);assert.deepEqual(data.state.orders,before.orders);
data=await read();assert.deepEqual(data.state.fronts,before.fronts,'saved across requests');
console.log('API: auth, CSRF, input validation, zero orders, completion, idempotency, undo and persistence passed.');
