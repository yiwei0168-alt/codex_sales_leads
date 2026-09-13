import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
// Public GET only; does not load account credentials or change product routing/rates.
const url='https://openrouter.ai/api/v1/models/openai/gpt-5.6-sol-20260709/endpoints';
const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`Public metadata HTTP ${response.status}`);
const raw=await response.text(),data=JSON.parse(raw).data;
if(data.id!=='openai/gpt-5.6-sol')throw new Error('Unexpected model');
const endpoint=data.endpoints.find((item:{tag:string})=>item.tag==='openai');
if(!endpoint||endpoint.context_length!==1050000)throw new Error('Unexpected standard OpenAI endpoint');
const discount=endpoint.pricing.discount??0;
if(typeof discount!=='number'||discount<0||discount>=1)throw new Error('Invalid discount');
const skus=['prompt','input_cache_read','input_cache_write','completion'] as const;
const maxima=Object.fromEntries(skus.map(sku=>{
  const values=[endpoint.pricing,...(endpoint.pricing.overrides??[])].map(price=>Number(price[sku])/(1-discount));
  if(values.some(value=>!Number.isFinite(value)||value<0))throw new Error('Incomplete price');
  return [sku,Math.max(...values)];
}));
const maximumChargeMicros=Math.ceil((1050000*Math.max(maxima.prompt,maxima.input_cache_read,maxima.input_cache_write)+4096*maxima.completion)*1e6);
if(maximumChargeMicros!==10622880)throw new Error('Reviewed candidate price changed; re-review required');
const result={status:'proposal-only-user-routing-confirmation-required',capturedAt:new Date().toISOString(),
  source:{url,sha256:createHash('sha256').update(raw).digest('hex')},model:data.id,provider:'openai',
  proposedProvider:{only:['openai'],allow_fallbacks:false,require_parameters:true,data_collection:'deny'},
  inputAccounting:'disjoint-uncached-read-write; max category for full context',contextTokens:1050000,outputTokens:4096,
  undiscountedPerTokenMaxima:maxima,maximumChargeMicros,maximumChargeUsd:maximumChargeMicros/1e6,
  scope:'market-playbook only; existing text JSON contract and no service tier opt-in',
  cost:'no inference, no account read, no tariff/routing/budget mutation',fullRunBoundUsd:null};
if(process.argv.includes('--write'))await writeFile('docs/SOL_OPENAI_ONLY_PROPOSAL_2026-09-13.json',JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify(result));
