import assert from 'node:assert/strict';
import {fresh,type Front} from '../lib/domain';
import {parseDictation} from '../lib/llm';
import {applyParsed} from '../lib/reducer';
process.loadEnvFile('.env.local');
const config={provider:'anthropic' as const,key:process.env.ANTHROPIC_API_KEY!,model:process.env.ANTHROPIC_MODEL||'claude-sonnet-5',workspaceId:process.env.ANTHROPIC_WORKSPACE_ID};
let s=fresh();for(const title of ['Tez','Robotik']){const id=title;const f:Front={id,title,type:'lane',status:title==='Tez'?'active':'held',moves:[{id:id+'-m',text:'Proje notlarını aç ve ilk soruyu yaz.'}],where:'',question:'',notes:[],touched:new Date().toISOString()};s.fronts[id]=f;}
const raw="Aklıma bir şey geldi, veri setini sentetik verilerle genişletmek. Bir de 'Attention Is All You Need' makalesini okumam lazım.";
const p=await parseDictation(raw,s,null,config);console.log(JSON.stringify(p));assert.equal(p.items.length,0);assert.equal(p.ideas?.length,2);const before=structuredClone(s.fronts);s=applyParsed(s,p,raw);assert.deepEqual(s.fronts,before);
const focus='Bu hafta Robotik projesine de odaklanıyorum.';const q=await parseDictation(focus,s,null,config);console.log(JSON.stringify(q));s=applyParsed(s,q,focus);assert.equal(s.fronts.Robotik.status,'active');assert.equal(s.fronts.Tez.status,'active');assert.equal(Object.keys(s.fronts).length,2);
const old=await parseDictation(raw,s,null,config,undefined,undefined,true);assert.equal(old.items.length,0);assert.equal(old.events?.length,0);assert.equal(old.ideas?.length,2);console.log('P3: idea-only capture, explicit activation, and isolated legacy extraction passed.');
