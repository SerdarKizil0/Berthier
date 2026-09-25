import fs from 'node:fs';
if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
const keys=['ANTHROPIC_API_KEY','ANTHROPIC_MODEL','ANTHROPIC_WORKSPACE_ID','GEMINI_API_KEY','GEMINI_MODEL'];
const values=keys.flatMap(key=>process.env[key]?[`${key}=${process.env[key]}`]:[]);
if(!process.env.GEMINI_API_KEY&&process.env.GOOGLE_API_KEY)values.push(`GEMINI_API_KEY=${process.env.GOOGLE_API_KEY}`);
fs.writeFileSync('.dev.vars',values.join('\n')+'\n');
console.log('Yerel gizli değerler güncellendi. Anahtar değerleri gösterilmedi.');
