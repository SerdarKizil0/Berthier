import fs from 'node:fs';
const front={id:'qa-front',title:'İstatistik',type:'course',status:'active',moves:[{id:'qa-first',text:'İstatistik ders sayfasını aç ve konuları listele.'},{id:'qa-next',text:'İstatistik ilk konusundaki 3 örnek soruyu çöz.'}],where:'',question:'',notes:[],touched:new Date().toISOString()};
const state={fronts:{[front.id]:front},orders:{},setup:false,changes:[],receipts:[]};
fs.mkdirSync('.sites-runtime',{recursive:true});fs.writeFileSync('.sites-runtime/qa.sql',`INSERT OR IGNORE INTO notebooks (owner, revision, data) VALUES ('berthier-qa',0,'${JSON.stringify(state).replaceAll("'","''")}');`);
