import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractMedia,mediaKind,MEDIA_LIMIT} from '../lib/media';
import {parseDictation} from '../lib/llm';
import {fresh} from '../lib/domain';
test('media validates unsupported, empty, oversized and wrong-provider input before network',async()=>{
 assert.throws(()=>mediaKind('image/heic'));assert.equal(mediaKind('audio/webm;codecs=opus'),'audio');
 await assert.rejects(extractMedia(new Uint8Array(),'image/png',{}));
 await assert.rejects(extractMedia(new Uint8Array(MEDIA_LIMIT+1),'audio/wav',{}));
 await assert.rejects(extractMedia(new Uint8Array(7*1024*1024+1),'image/png',{}));
 await assert.rejects(extractMedia(new Uint8Array([1]),'audio/wav',{GEMINI_API_KEY:'sk-svcac-fixture'}),/yanlış/);
});
test('audio uses Gemini inline M4A and never a files upload endpoint',async()=>{
 const original=globalThis.fetch;let called=0;globalThis.fetch=(async(url,init)=>{called++;assert.match(String(url),/^https:\/\/generativelanguage.googleapis.com\//);const body=JSON.parse(String(init?.body));assert.equal(body.contents[0].parts[0].inlineData.mimeType,'audio/m4a');return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({text:'Yarın Fizik labı 13:00.',warning:''})}]},finishReason:'STOP'}]});}) as typeof fetch;
 try{const result=await extractMedia(new Uint8Array([1,2]),'audio/mp4;codecs=mp4a.40.2',{GEMINI_API_KEY:'fixture'});assert.equal(result.text,'Yarın Fizik labı 13:00.');assert.equal(called,1);}finally{globalThis.fetch=original;}
});
test('provider errors and incomplete output cannot leak credentials or partial transcript',async()=>{
 const original=globalThis.fetch;globalThis.fetch=(async()=>new Response('Incorrect API key provided: PRIVATE',{status:401})) as typeof fetch;
 try{await assert.rejects(extractMedia(new Uint8Array([1]),'image/png',{ANTHROPIC_API_KEY:'fixture'}),e=>!String(e).includes('PRIVATE')&&String(e).includes('doğrulanamadı'));globalThis.fetch=(async()=>Response.json({content:[{type:'text',text:'{"text":"yarım","warning":""}'}],stop_reason:'max_tokens'})) as typeof fetch;await assert.rejects(extractMedia(new Uint8Array([1]),'application/pdf',{ANTHROPIC_API_KEY:'fixture'}),/yarım/);}finally{globalThis.fetch=original;}
});
test('external documents cannot finish moves, edit bookmarks or change lane/preparation preferences',async()=>{
 const s=fresh();s.fronts.a={id:'a',title:'Tez',type:'lane',status:'active',where:'Önceki yer',question:'Önceki soru',notes:[],touched:'now',moves:[{id:'m',text:'İlk bölümü yaz'}]};
 const original=globalThis.fetch;globalThis.fetch=(async()=>Response.json({content:[{type:'text',text:JSON.stringify({items:[{id:'a',title:'Tez',type:'lane',complete:true,completedMoveId:'m',moves:[],where:'Değişti',question:'Değişti',prerequisite:null}],laneUpdates:[{id:'a',title:'Tez',status:'held'}],prepDefaults:[{kind:'exam',days:1}],question:null,summary:'Belge',events:[],ideas:[]})}]})) as typeof fetch;
 try{const p=await parseDictation('Dış belge',s,null,{provider:'anthropic',key:'fixture',model:'fixture'},undefined,'2026-10-13',false,true);assert.equal(p.items[0].complete,false);assert.equal(p.items[0].completedMoveId,null);assert.equal(p.items[0].where,null);assert.equal(p.items[0].question,null);assert.deepEqual(p.laneUpdates,[]);assert.deepEqual(p.prepDefaults,[]);}finally{globalThis.fetch=original;}
});
