import {mkdir,writeFile} from 'node:fs/promises';
import {connect} from 'node:net';
import {modelRoutedTransport} from '../../src/lib/network/model-transport';
import {failureDiagnostic} from '../../src/lib/network/failure-diagnostic';
const root='experiments/hybrid-evaluation-v5/results';await mkdir(root,{recursive:true});
const proxy=new URL(process.env.MODEL_PROXY_URL??'');
if(proxy.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(proxy.hostname)||proxy.username||proxy.password)throw Error('Expected configured local credential-free HTTP proxy');
const tcp=await new Promise<{ok:boolean;diagnostic?:ReturnType<typeof failureDiagnostic>}>(resolve=>{
 const socket=connect({host:proxy.hostname,port:Number(proxy.port||80)});
 socket.setTimeout(3000);socket.once('connect',()=>{socket.destroy();resolve({ok:true});});
 socket.once('timeout',()=>{socket.destroy();resolve({ok:false});});
 socket.once('error',error=>{socket.destroy();resolve({ok:false,diagnostic:failureDiagnostic(error)});});
});
const checks=[];
// Three separately recorded non-billable reachability observations; never a model request or task replay.
for(let observation=1;observation<=3;observation++){
 const startedAt=new Date().toISOString(),start=performance.now();
 try{
  const url='https://openrouter.ai/api/v1/models',init={method:'GET',signal:AbortSignal.timeout(15000)};
  const response=await modelRoutedTransport(fetch,url,init)(url,init);
  await response.body?.cancel();
  checks.push({observation,startedAt,status:response.status,latencyMs:performance.now()-start});
 }catch(error){checks.push({observation,startedAt,diagnostic:failureDiagnostic(error),latencyMs:performance.now()-start});}
}
const report={version:'hybrid-v5-nonbillable-network-check',proxy:{host:proxy.hostname,port:Number(proxy.port||80)},tcp,checks,
 modelCalls:0,authorizationSent:false,transport:'Existing product modelRoutedTransport; configured proxy retained',
 limitation:'A successful small public GET does not establish stability of authenticated large POST/streaming model requests or reconcile prior socket errors. No proxy configuration changed.'};
await writeFile(`${root}/network-check.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
