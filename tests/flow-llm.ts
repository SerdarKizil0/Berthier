import assert from 'node:assert/strict';
import {fresh,nextMove} from '../lib/domain';
import {parseDictation,type LlmConfig} from '../lib/llm';
import {applyParsed} from '../lib/reducer';
process.loadEnvFile('.env.local');
const config:LlmConfig={provider:'anthropic',key:process.env.ANTHROPIC_API_KEY!,workspaceId:process.env.ANTHROPIC_WORKSPACE_ID,model:process.env.ANTHROPIC_MODEL||'claude-sonnet-5'};
const p=await parseDictation('Reuteri yoğurt yap',fresh(),null,config);assert.equal(p.items.length,1);assert.equal(p.items[0].moves[0].replace(/[.!]$/,''),'Reuteri yoğurt yap');assert.equal(p.items[0].prerequisite,null);assert.equal(nextMove(Object.values(applyParsed(fresh(),p,'Reuteri yoğurt yap').fronts)[0])?.text,p.items[0].moves[0]);console.log('Direct action preserved without invented preparation.');
const s=fresh();s.movePreferences=[{frontTitle:'Yoğurt',before:'Tarifi bul ve malzemeleri listele',after:'Yoğurdu mayala',at:new Date().toISOString()}];const q=await parseDictation('Yoğurt yapacağım.',s,null,config);assert.ok(q.items.length);assert.ok(!q.items.flatMap(i=>i.moves).some(m=>/tarif|malzeme|listele/iu.test(m)));console.log('A similar task respects the saved correction.');
