import {writeFile} from 'node:fs/promises';
import {modelRoutedTransport} from '../../src/lib/network/model-transport';
// Public catalog only: no credentials, private input, completion, decision or billed model call.
const url='https://openrouter.ai/api/v1/models';
const checks=[];
for(let i=0;i<3;i++){
 const start=performance.now();
 try{
  const response=await modelRoutedTransport(fetch,url)(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
  await response.body?.cancel();checks.push({attempt:i+1,status:response.status,elapsedMs:performance.now()-start});
 }catch(error){
  const e=error as {name?:string;code?:string;cause?:{name?:string;code?:string}};
  checks.push({attempt:i+1,elapsedMs:performance.now()-start,name:e.name,code:e.code??null,causeName:e.cause?.name??null,causeCode:e.cause?.code??null});
 }
}
const report={version:'hybrid-v2-public-connectivity-check',modelCalls:0,authorizationHeadersSent:false,
 proxyConfigured:Boolean(process.env.MODEL_PROXY_URL),checks,
 limitation:'Public metadata connectivity only; cannot prove generation availability, establish the cause of earlier failures or reconcile charges.'};
await writeFile('experiments/hybrid-evaluation-v2/results/connectivity.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
