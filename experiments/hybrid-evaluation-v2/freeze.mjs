import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root='experiments/hybrid-evaluation-v2',local='.local-runtime/hybrid-evaluation-v2';
const sha=text=>createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const old=JSON.parse(await readFile('experiments/hybrid-evaluation-v1/manifest.json','utf8'));
const designFiles=Object.keys(old.sha256).filter(p=>p.startsWith('experiments/'));
designFiles.push('experiments/hybrid-evaluation-v1/manifest.json',`${root}/README.md`);
const design={};for(const p of designFiles)design[p]=sha(await readFile(p,'utf8'));
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','config','db/migrations','package.json','package-lock.json',root],{encoding:'utf8'}).trim().split(/\r?\n/)
 .filter(p=>!p.includes('/results/')&&!p.endsWith('/manifest.json'));
files.push('experiments/hybrid-evaluation-v1/runtime.ts','experiments/hybrid-evaluation-v1/seed-mail.ts','experiments/hybrid-evaluation-v1/seed-knowledge.ts');
const sources={};for(const p of [...new Set(files)])sources[p]=sha(await readFile(p,'utf8'));
await mkdir(local,{recursive:true});
await writeFile(`${root}/manifest.json`,json({version:'hybrid-evaluation-amendment-v2',priorManifest:sha(await readFile('experiments/hybrid-evaluation-v1/manifest.json','utf8')),sha256:design}),{flag:'wx'});
await writeFile(`${local}/source-freeze.json`,json({version:'hybrid-source-freeze-v2',sources}),{flag:'wx'});
console.log(json({sourceFiles:Object.keys(sources).length,paidCalls:0}));
