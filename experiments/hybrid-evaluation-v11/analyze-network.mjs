import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='.local-runtime/hybrid-evaluation-v11/performance',target='experiments/hybrid-evaluation-v11/results';
const rows=[];
for(const file of (await readdir(base)).filter(f=>f.endsWith('.trace.json')).sort()){
 const text=await readFile(`${base}/${file}`,'utf8'),trace=JSON.parse(text);
 rows.push({task:file.replace('.trace.json',''),traceHash:createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex'),
  httpAttempts:trace.wire.length,headersReceived:trace.wire.filter(w=>w.status!==undefined).length,
  preResponseFailures:trace.wire.filter(w=>w.diagnostic).map(w=>({model:w.model,diagnostic:w.diagnostic})),
  modelFailures:trace.calls.filter(c=>c.metrics?.failureDiagnostic).map(c=>({model:c.metrics.requestedModel,diagnostic:c.metrics.failureDiagnostic}))});
}
const report={version:'v11-network-phase-audit',rows,paidCalls:0,
 conclusion:'Per-request phases are diagnostic only. Model failures and wire failures may describe the same request and must not be summed as distinct failures. No retry or zero-charge inference. External failing component remains unproven.'};
await mkdir(target,{recursive:true});await writeFile(`${target}/network-phases.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({tasks:rows.length,preResponseFailures:rows.reduce((n,r)=>n+r.preResponseFailures.length,0),modelFailures:rows.reduce((n,r)=>n+r.modelFailures.length,0)}));
