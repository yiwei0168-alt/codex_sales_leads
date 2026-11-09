import {readFile,writeFile,readdir} from 'node:fs/promises';
const directory='.local-runtime/hybrid-evaluation-v3/performance',rows=[];
for(const file of (await readdir(directory)).filter(f=>f.endsWith('.trace.json')).sort()){
 const trace=JSON.parse(await readFile(`${directory}/${file}`,'utf8'));
 const observation=JSON.parse(await readFile(`${directory}/${file.replace('.trace.json','.observation.json')}`,'utf8'));
 const programs=trace.calls.filter(c=>['programmatic_tools','programmatic_read'].includes(c.tool_id));
 rows.push({file,status:observation.status,modelCalls:observation.modelAttempts,
  inputTokens:observation.billableEvents.reduce((s,e)=>s+(e.usage.inputTokens??0),0),
  cachedTokens:observation.billableEvents.reduce((s,e)=>s+(e.usage.cachedTokens??0),0),
  outputTokens:observation.billableEvents.reduce((s,e)=>s+(e.usage.outputTokens??0),0),
  programs:programs.map(c=>({tool:c.tool_id,status:c.output?.status,valueChars:JSON.stringify(c.output?.data?.value??null).length,
   savedLeaves:c.output?.data?.leaves?.length??0,usesReceipt:c.input.code.includes('tools.receipt('),usesTime:c.input.code.includes('tools.time(')})),
  transportFailures:trace.wire.filter(w=>w.error).map(w=>({model:w.model,path:w.path,startedAt:w.startedAt,endedAt:w.endedAt,diagnostic:w.diagnostic})),
  journalFailures:trace.calls.filter(c=>c.metrics?.failureDiagnostic).map(c=>({tool:c.tool_id,diagnostic:c.metrics.failureDiagnostic}))});
}
await writeFile('experiments/hybrid-evaluation-v3/results/program-inspection.json',JSON.stringify({version:'program-inspection-v3',rows},null,2)+'\n');
console.log(JSON.stringify(rows,null,2));
