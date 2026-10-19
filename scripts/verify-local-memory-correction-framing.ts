import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {extractLocalMemoryCorrection} from '../src/lib/knowledge/local-memory-extraction';
import {validateNaturalCorrection} from '../src/lib/knowledge/natural-memory-correction';

nextEnv.loadEnvConfig(process.cwd());
process.env.OLLAMA_LOCAL_URL='http://127.0.0.1:11434';
const text='I previously said I prefer detailed summaries. That was wrong: I prefer short summaries.';
let chats=0,tags=0,raw='';
const bounded:typeof fetch=async(resource,init)=>{
 const url=new URL(resource instanceof Request?resource.url:String(resource));
 assert.equal(url.origin,'http://127.0.0.1:11434');assert.equal(init?.redirect,'error');
 if(url.pathname==='/api/chat'){assert.equal(++chats,1);assert.equal(init?.method,'POST');}
 else{assert.equal(url.pathname,'/api/tags');tags++;}
 const response=await fetch(resource,init);assert(response.ok);
 const body=await response.text();if(url.pathname==='/api/chat')raw=body;
 return new Response(body,{status:response.status,headers:{'content-type':'application/json'}});
};
const proposal=await extractLocalMemoryCorrection(text,bounded);
assert.deepEqual(validateNaturalCorrection(text,proposal),{recognized:true,correction:{oldContent:'I prefer detailed summaries',content:'I prefer short summaries'}});
assert.equal(chats,1);assert.equal(tags,1);
await writeFile('tmp/ma24-english-correction-framing-raw.json',raw);
const result={passed:true,actualLocalModelContract:true,model:'qwen3:8b',language:'en',actualChatCalls:chats,tagCalls:tags,
 rawResponseSha256:createHash('sha256').update(raw).digest('hex'),normalized:!!proposal.framingNormalization,
 databaseOrWorkerFlowVerified:false,syntheticSourceOnly:true,cloudCalls:0,productionWrites:0,independentQualityAccepted:false};
await writeFile('tmp/ma24-english-correction-framing-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
