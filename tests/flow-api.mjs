import assert from 'node:assert/strict';
const base='http://127.0.0.1:5174',owner='flow-api-'+crypto.randomUUID();
const headers={'oai-authenticated-user-id':owner,'oai-authenticated-user-email':'qa@berthier.invalid',Origin:base,'Content-Type':'application/json'};
async function post(body,expected=200){const r=await fetch(base+'/api/state',{method:'POST',headers,body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,expected,d.error);return d;}
const read=async()=>(await fetch(base+'/api/state',{headers})).json();
const id=crypto.randomUUID(),text='Reuteri yoğurt yap';
let start=Date.now();await post({id,kind:'enqueue',text},202);console.log('Durable enqueue latency:',Date.now()-start,'ms');
let d=await read();assert.equal(d.dictations[0].status,'queued');assert.equal(d.dictations[0].raw,text);assert.equal(Object.keys(d.state.fronts).length,0);
await post({id,kind:'enqueue',text:'Farklı metin'},503);d=await read();assert.equal(d.dictations[0].raw,text);assert.equal(d.dictations[0].status,'queued');
const pending=post({id,kind:'dictate',text});
await post({id:crypto.randomUUID(),kind:'setup',ids:[]});
d=await pending;assert.equal(d.state.setup,true);const front=Object.values(d.state.fronts)[0];assert.equal(front.moves[0].text.replace(/[.!]$/,''),text);
const duplicate=await post({id,kind:'dictate',text});assert.equal(duplicate.state.changes.length,d.state.changes.length);
await post({id:crypto.randomUUID(),kind:'edit',frontId:front.id,text:'Yoğurdu mayala'});d=await read();assert.equal(d.state.movePreferences[0].after,'Yoğurdu mayala');
// A queued answer remains recoverable without sending the original raw text back from the browser.
const answerId=crypto.randomUUID();await post({id:answerId,kind:'enqueue',text:'2026-10-12',replyTo:'99fab972-62b3-4b91-8340-2d2a87c5cfaa'},503); // another owner's question
assert.equal((await read()).dictations.some(x=>x.id===answerId),false);
console.log('Durable queue, duplicate/collision protection, concurrent edit preservation, short action, preference persistence and reply ownership passed.');
