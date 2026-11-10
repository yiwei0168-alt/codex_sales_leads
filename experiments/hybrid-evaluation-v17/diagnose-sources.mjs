import {readFile,writeFile,readdir} from 'node:fs/promises';
import {checkMechanics} from '../hybrid-source-coverage-v2/coverage.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const env={fixture:await read('experiments/hybrid-evaluation-v1/business-fixtures.json'),mail:await read('.local-runtime/hybrid-evaluation-v1/mail-binding.json'),knowledge:await read('.local-runtime/hybrid-evaluation-v1/knowledge-binding.json'),extension:await read('.local-runtime/hybrid-local-read-extension-v1/binding.json'),originals:await read('.local-runtime/hybrid-knowledge-originals-v2/binding.json')};
const rows=[];
for(const name of (await readdir('.local-runtime/hybrid-evaluation-v17/performance')).filter(n=>n.endsWith('.observation.json'))){
 const o=await read(`.local-runtime/hybrid-evaluation-v17/performance/${name}`),trace=await read(o.traceRef);
 rows.push({taskId:o.taskId,arm:o.arm,status:o.status,coverage:checkMechanics(o.taskId,trace.calls,env)});
}
const report={paidCalls:0,modelQualityReviewed:false,acceptancePassed:false,rows};
await writeFile('experiments/hybrid-evaluation-v17/results/source-diagnostics.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({submitted:rows.length,sourceCoveragePassed:rows.filter(r=>r.coverage.passed).length,acceptancePassed:false}));
