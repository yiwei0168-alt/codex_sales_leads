import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getOpenRouterConfig} from '../../src/providers/openrouter';
import {modelRoutedTransport} from '../../src/lib/network/model-transport';
import {matchesBatchModel} from '../../src/providers/openrouter-batch';
// Read-only capability check using a completed, locally saved review call.
// Does not manufacture an incomplete receipt or mutate its billing reservation.
const source='.local-runtime/hybrid-evaluation-quality-v10/repeats-P01.receipt.json';
const text=await readFile(source,'utf8'),saved=JSON.parse(text);
if(saved.status!=='completed'||!/^gen-[-a-zA-Z0-9_]{1,124}$/.test(saved.response?.generationId))throw Error('No completed bound generation');
const config=getOpenRouterConfig();if(config.baseUrl!=='https://openrouter.ai/api/v1')throw Error('Unexpected host');
const url=new URL(`${config.baseUrl}/generation`);url.searchParams.set('id',saved.response.generationId);
const started=performance.now();
const report:Record<string,unknown>={version:'openrouter-metadata-read-probe-v1',sourceReceiptHash:createHash('sha256').update(text).digest('hex'),newModelRequests:0,metadataRequests:1,productionChanged:false};
try{
 const init={method:'GET',headers:{Authorization:`Bearer ${config.apiKey}`},signal:AbortSignal.timeout(15000),redirect:'error' as const};
 const response=await modelRoutedTransport(fetch,url,init)(url,init);report.httpStatus=response.status;
 if(response.ok){const body=await response.json();const d=body.data;
  report.identityMatched=d?.id===saved.response.generationId&&matchesBatchModel(d?.model??'','anthropic/claude-sonnet-5.5');
  report.providerCostUsd=typeof d?.total_cost==='number'?d.total_cost:null;report.inlineCostUsd=saved.response.usage?.cost??null;
  report.costMatched=report.providerCostUsd!==null&&report.providerCostUsd===report.inlineCostUsd;
  report.terminalFinish=d?.finish_reason??null;report.cancelled=d?.cancelled??null;report.isByok=d?.is_byok??null;
 }else await response.body?.cancel();
}catch(error){report.errorName=error instanceof Error?error.name:'UnknownError';}
report.latencyMs=Math.round(performance.now()-started);
await writeFile('experiments/hybrid-stream-recovery-v1/results/provider-metadata.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
