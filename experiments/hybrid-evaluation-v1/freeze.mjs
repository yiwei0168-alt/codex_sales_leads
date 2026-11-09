import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root='experiments/hybrid-evaluation-v1';
const manifestPath=`${root}/manifest.json`;
// Text is normalized to LF for reproducibility across Windows Git checkouts.
const hash=async path=>createHash('sha256').update((await readFile(path,'utf8')).replaceAll('\r\n','\n')).digest('hex');
if(process.argv.includes('--check')){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.version!=='hybrid-evaluation-design-freeze-v1')throw Error('Unexpected manifest version');
 for(const [path,digest] of Object.entries(manifest.sha256))if(await hash(path)!==digest)throw Error(`Frozen file changed: ${path}`);
 console.log(JSON.stringify({designFreeze:'valid',files:Object.keys(manifest.sha256).length,liveRunAdmission:false}));
}else{
 const report=JSON.parse(await readFile(`${root}/validation.json`,'utf8'));
 if(!report.passed||report.modelCalls!==0||report.evaluationResultsAvailable!==false)throw Error('Expected passing offline design validation');
 const files=['design.mjs','validate.ts','validation.json','README.md','observations.schema.json','freeze.mjs','protocol.json',
  'routing-cases.json','routing-inputs.json','business-fixtures.json','performance-tasks.json','performance-inputs.json','paired-schedule.json','live-external-tasks.json'].map(name=>`${root}/${name}`);
 files.push('config/agent/jev-program-policy-v4.json','config/lead-scoring/policy-v2.0.0.json',
  'src/providers/program-decision-contract.ts','src/providers/program-decision-contract-v4.ts',
  ...['automatic-execution.ts','mode-config.ts','decision-routing.ts','hybrid-routing.ts','hybrid-contracts.ts','initial-task-messages.ts','graph.ts','program-decision-routing-v4.ts'].map(name=>`src/lib/assistant/main/${name}`));
 const sha256={};for(const path of files)sha256[path]=await hash(path);
 const manifest={version:'hybrid-evaluation-design-freeze-v1',phase:'design-only',normalization:'UTF-8 text CRLF to LF; sha256',
  productSourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceCoverage:'Selected contract/model/graph sources only, not a complete runtime dependency closure.',
  pendingRunBindings:['Independent semantic label review version','Isolated tenant, valid UUID mapping and repeatable snapshot',
   'Real tool adapter and complete runner/runtime dependency hash','Frozen model/provider/timeout/fallback configuration',
   'Existing approved spend limits and receipt deduplication','UI timing instrumentation','L03 independently selected public candidates'],sha256};
 // Deliberately refuse to overwrite a freeze. Create a reviewed new version for changes.
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({designFreeze:'created',files:files.length,liveRunAdmission:false}));
}
