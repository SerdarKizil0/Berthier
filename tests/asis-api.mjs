import assert from 'node:assert/strict';
// “Olduğu gibi ekle”, “Kaldır” and Harita › Seç through the compiled Worker (npm run start -- --port 5174), on their
// own QA identity. The local Worker has no model key, so a dictation fails while these commands go through: no model
// call, no dictation row. Every change is taken back at the end, newest first.
const base='http://127.0.0.1:5174';
const headers={'oai-authenticated-user-id':'berthier-qa-asis','oai-authenticated-user-email':'qa-asis@berthier.invalid','Content-Type':'application/json',Origin:base};
async function read(){const r=await fetch(base+'/api/state',{headers});assert.equal(r.status,200);return r.json();}
async function command(body,status=200){const r=await fetch(base+'/api/state',{method:'POST',headers,body:JSON.stringify({id:crypto.randomUUID(),...body})});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
let data=await read();const first=data.state.changes.length,rows=data.dictations.length,ids=[crypto.randomUUID(),crypto.randomUUID()];
// Two new fronts, the second on today's route; the text stays as written (no move rules).
data=await command({kind:'addMove',frontId:ids[0],title:'Kargo iadesi',text:'İade formunu doldur.'});assert.equal(data.summary,'Hamle eklendi');
const repeat={id:crypto.randomUUID(),kind:'addMove',frontId:ids[0],title:'Kargo iadesi',text:'  Paketi   PTT’ye götür. '};
data=await command(repeat);assert.deepEqual(data.state.fronts[ids[0]].moves.map(m=>m.text),['İade formunu doldur.','Paketi PTT’ye götür.']);
// The same request id is applied once.
data=await command(repeat);assert.equal(data.replayed,true);assert.equal(data.state.fronts[ids[0]].moves.length,2);
data=await command({kind:'select',ids:[ids[0]]});
data=await command({kind:'addMove',frontId:ids[1],title:'İstatistik',text:'İstatistik çalış',today:true});
const day=Object.keys(data.state.orders).sort().at(-1);assert.deepEqual(data.state.orders[day].slots.map(x=>x.frontId),ids);
// Only the length limit holds.
await command({kind:'addMove',frontId:ids[0],title:'Kargo iadesi',text:'x'.repeat(121)},503);
// Kaldır: the next move leaves, the following one takes the slot; the move stays on record.
const removed=data.state.fronts[ids[0]].moves[0].id;
data=await command({kind:'removeMove',frontId:ids[0],moveId:removed});assert.equal(data.summary,'Hamle kaldırıldı');
assert.ok(data.state.fronts[ids[0]].moves.find(m=>m.id===removed).removedAt);assert.equal(data.state.orders[day].slots[0].text,'Paketi PTT’ye götür.');
await command({kind:'removeMove',frontId:ids[0],moveId:removed},503);
// Harita › Seç: both close in one change and leave the route.
data=await command({kind:'closeFronts',ids});assert.equal(data.summary,'2 cephe kapatıldı');
assert.deepEqual(ids.map(id=>data.state.fronts[id].status),['closed','closed']);assert.equal(data.state.orders[day].slots.length,0);
// Bitti without the model (5 Ekim): even an old client's skip:false completion of an İş front's last move closes it;
// a Ders front stays open with no next move, and “Berthier önersin” says plainly that the model is not reachable.
const more=[crypto.randomUUID(),crypto.randomUUID()];
await command({kind:'addMove',frontId:more[0],title:'Dekanlık imzası',text:'Dilekçeyi dekanlığa götür.'});
await command({kind:'addMove',frontId:more[1],title:'Fizik',text:'Vize konularını listele.'});data=await command({kind:'retype',frontId:more[1],type:'course'});
data=await command({kind:'complete',frontId:more[0],skip:false});assert.equal(data.summary,'Hamle tamamlandı; cephe kapandı');assert.equal(data.state.fronts[more[0]].status,'closed');
data=await command({kind:'complete',frontId:more[1]});assert.equal(data.summary,'Hamle tamamlandı');assert.equal(data.state.fronts[more[1]].status,'active');assert.ok(data.state.fronts[more[1]].moves.every(m=>m.doneAt));
const refused=await command({kind:'suggest',frontId:more[1]},503);assert.match(refused.error,/öneremedi/);
// No dictation was written (no model).
assert.equal(data.dictations.length,rows);
// Everything is taken back, newest first.
for(const c of data.state.changes.slice(first).reverse())if(!c.ops.every(o=>o.undone))data=await command({kind:'undo',changeId:c.id});
for(const id of [...ids,...more])assert.equal(data.state.fronts[id],undefined);
console.log('asis-api: add, replay, today, length, remove, close, Bitti without the model, suggest, undo passed');
