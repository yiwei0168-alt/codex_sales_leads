import {channel} from 'node:diagnostics_channel';
import {writeFile} from 'node:fs/promises';
import {modelRoutedTransport} from '../../src/lib/network/model-transport';
import {failureDiagnostic} from '../../src/lib/network/failure-diagnostic';
const stages=['undici:client:beforeConnect','undici:client:connected','undici:client:connectError','undici:client:sendHeaders','undici:request:bodySent','undici:request:headers','undici:request:error'];
const rows=[];
// No Authorization header, no business data: the endpoint must reject before model admission.
for(const bytes of [2,50000,100000]){
 const events:Array<{stage:string;elapsedMs:number}>=[],start=performance.now();
 const handlers=stages.map(stage=>{const handler=()=>{if(events.length<100)events.push({stage,elapsedMs:performance.now()-start});};channel(stage).subscribe(handler);return {stage,handler};});
 try{
  const url='https://openrouter.ai/api/v1/chat/completions',body=bytes===2?'{}':JSON.stringify({diagnosticPadding:'x'.repeat(bytes-24)});
  const init={method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(15000),redirect:'error' as const};
  const response=await modelRoutedTransport(fetch,url,init)(url,init);await response.body?.cancel();
  rows.push({bytes:Buffer.byteLength(body),status:response.status,elapsedMs:performance.now()-start,events});
  if(response.status!==401&&response.status!==403)break; // Unexpected admission response: do not probe again.
 }catch(error){rows.push({bytes,diagnostic:failureDiagnostic(error),elapsedMs:performance.now()-start,events});}
 finally{for(const {stage,handler} of handlers)channel(stage).unsubscribe(handler);}
}
const report={version:'v5-unauthenticated-post-transport-probe',authorizationSent:false,modelCalls:0,rows,
 limitation:'Invalid unauthenticated synthetic requests only. No inference request or paid retry. Diagnostics contain event names/timings only; no header, body, connection address or private content. Passing probes cannot establish stream stability.'};
await writeFile('experiments/hybrid-evaluation-v5/results/transport-probe.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
