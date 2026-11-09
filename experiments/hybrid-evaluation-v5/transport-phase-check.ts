import {writeFile} from 'node:fs/promises';
import {modelRoutedTransport} from '../../src/lib/network/model-transport';
import {failureDiagnostic} from '../../src/lib/network/failure-diagnostic';
const rows=[];
for(let observation=1;observation<=2;observation++){
 const start=performance.now();
 try{
  const url='https://openrouter.ai/api/v1/chat/completions';
  const init={method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000),redirect:'error' as const};
  const response=await modelRoutedTransport(fetch,url,init)(url,init);await response.body?.cancel();
  rows.push({observation,status:response.status,elapsedMs:performance.now()-start});
  if(![401,403].includes(response.status))break;
 }catch(error){rows.push({observation,diagnostic:failureDiagnostic(error),elapsedMs:performance.now()-start});}
}
const result={version:'nonbillable-transport-phase-check-v1',authorizationSent:false,modelCalls:0,rows,
 limitation:'No authenticated inference. Phase observations do not authorize retry or classify prior unknown charges as zero.'};
await writeFile('experiments/hybrid-evaluation-v5/results/transport-phase-check.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
