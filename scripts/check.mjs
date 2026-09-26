import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const file=process.argv.includes('--media')?'media.test':process.argv.includes('--media-live')?'media-live':process.argv.includes('--flow')?'flow.test':process.argv.includes('--flow-llm')?'flow-llm':process.argv.includes('--research')?'research.test':process.argv.includes('--p3-llm')?'research-llm':process.argv.includes('--p2-llm')?'calendar-llm':process.argv.includes('--calendar')?'calendar.test':process.argv.includes('--llm')?'llm-check':'domain.test';
await build({entryPoints:[`tests/${file}.ts`],outfile:`.sites-runtime/${file}.mjs`,bundle:true,platform:'node',format:'esm',packages:'external'});
const r=spawnSync(process.execPath,[...(file.endsWith('.test')?['--test']:[]),`.sites-runtime/${file}.mjs`],{stdio:'inherit',env:process.env});process.exitCode=r.status??1;
