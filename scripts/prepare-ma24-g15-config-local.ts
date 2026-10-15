/** Read-only G15 configuration preview. It does not freeze a corpus or authorize calls. */
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import nextEnv from '@next/env';
import {ma24LocalSourceClosure} from './lib/ma24-local-source-closure';

nextEnv.loadEnvConfig(process.cwd());
registerHooks({resolve(specifier,context,next){
  if(specifier==='server-only')return {url:'data:text/javascript,export {}',shortCircuit:true};
  return next(specifier,context);
}});

const [{availableTools,describeTool},{modeModelConfig},{modePromptRules,MODE_PROMPT_VERSION},
  {productPrompt,PRODUCT_VERSION},{modelFunctions}]=await Promise.all([
  import('../src/lib/assistant/main/tools'),
  import('../src/lib/assistant/main/mode-config'),
  import('../src/lib/assistant/main/mode-prompts'),
  import('../src/lib/assistant/main/product'),
  import('../src/lib/assistant/main/model'),
]);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const promptDateUtc=new Date().toISOString().slice(0,10);
const mode='standard' as const;
const userId='00000000-0000-4000-8000-000000000001';
const savedFlag=process.env.ENABLE_VECTORLESS_AGENT_SHADOW;
const savedUsers=process.env.VECTORLESS_AGENT_SHADOW_USER_IDS;
const scopes=[['industry'] as Array<'industry'|'company'|'product'>,
  ['company'] as Array<'industry'|'company'|'product'>,
  ['product'] as Array<'industry'|'company'|'product'>];
const arms=[];
try{
 for(const scope of scopes){
  process.env.ENABLE_VECTORLESS_AGENT_SHADOW='1';
  process.env.VECTORLESS_AGENT_SHADOW_USER_IDS=userId;
  const context={role:'member' as const,mode,knowledgeScope:scope,userId};
  const baseline=availableTools({...context,evaluationArm:'baseline'});
  const candidate=availableTools({...context,evaluationArm:'candidate'});
  const baselineIds=baseline.map(tool=>tool.id),candidateIds=candidate.map(tool=>tool.id);
  const added=candidateIds.filter(id=>!baselineIds.includes(id));
  const removed=baselineIds.filter(id=>!candidateIds.includes(id));
  if(removed.length||added.length!==7||added.some(id=>!id.startsWith('vectorless_')))
    throw new Error(`Unexpected arm tool difference for ${scope.join(',')}`);
  arms.push({knowledgeScope:scope,baseline:{toolCount:baselineIds.length,
    toolIdsSha256:hash(JSON.stringify(baselineIds)),
    toolSchemasSha256:hash(JSON.stringify(baseline.map(describeTool))),
    productPromptSha256:hash(productPrompt(baseline))},
    candidate:{toolCount:candidateIds.length,
      toolIdsSha256:hash(JSON.stringify(candidateIds)),
      toolSchemasSha256:hash(JSON.stringify(candidate.map(describeTool))),
      productPromptSha256:hash(productPrompt(candidate))},addedTools:added});
 }
}finally{
 if(savedFlag===undefined)delete process.env.ENABLE_VECTORLESS_AGENT_SHADOW;
 else process.env.ENABLE_VECTORLESS_AGENT_SHADOW=savedFlag;
 if(savedUsers===undefined)delete process.env.VECTORLESS_AGENT_SHADOW_USER_IDS;
 else process.env.VECTORLESS_AGENT_SHADOW_USER_IDS=savedUsers;
}
if(new Date().toISOString().slice(0,10)!==promptDateUtc)
  throw new Error('UTC date changed while computing product prompt hashes; rerun the G15 preview');
const sourceFiles=[
 'scripts/prepare-ma24-g15-config-local.ts',
 'scripts/lib/ma24-local-source-closure.ts','tsconfig.json','package.json','package-lock.json',
 'next.config.ts','scripts/build-next.mjs','scripts/package-ma24-next-standalone.py',
 'src/lib/assistant/main/graph.ts','src/lib/assistant/main/model.ts',
 'src/lib/assistant/main/model-stream.ts','src/lib/assistant/main/mode-config.ts',
 'src/lib/assistant/main/mode-prompts.ts','src/lib/assistant/main/mode-prompt-content.json',
 'src/lib/assistant/main/mode-tools.ts','src/lib/assistant/main/knowledge-response-policy.ts',
 'src/lib/assistant/main/product.ts','src/lib/assistant/main/tools.ts',
 'src/lib/assistant/main/vectorless-tools.ts','src/lib/knowledge/vectorless-session.ts',
 'src/lib/knowledge/vectorless.ts','src/lib/rag/repository.ts',
 'src/lib/rag/embedding-contract.ts','src/lib/rag/bge-client.ts',
 'src/lib/knowledge/query-normalizer.ts',
 'src/lib/knowledge/evaluation/ma24-evaluation-claim.ts',
 'src/lib/knowledge/evaluation/ma24-evaluation-runner.ts',
 'src/lib/knowledge/evaluation/ma24-evaluation-task-binding.ts',
 'src/lib/knowledge/evaluation/ma24-independent-comparison.ts',
 'src/lib/knowledge/evaluation/ma24-g15-runtime-binding.ts',
 'src/lib/knowledge/evaluation/ma24-g15-hard-limit-binding.ts',
 'src/lib/knowledge/evaluation/ma24-persisted-run-binding.ts',
 'src/lib/knowledge/evaluation/ma24-citation-evidence.ts',
 'scripts/score-ma24-independent-comparison.ts',
 'scripts/verify-ma24-g16-persisted-runs.ts',
 'db/migrations/136_ma24_evaluation_run_kind.sql',
 'db/migrations/137_ma24_explicit_evaluation_claim.sql',
 'db/migrations/138_ma24_evaluation_claim_owner.sql',
 'db/migrations/139_ma24_evaluation_hard_limits.sql',
 'db/migrations/140_ma24_evaluation_hard_limit_binding.sql',
];
const sourceHashes=await ma24LocalSourceClosure(process.cwd(),sourceFiles);
for(const required of [
 'next.config.ts','scripts/build-next.mjs','scripts/package-ma24-next-standalone.py',
 'src/lib/knowledge/evaluation/ma24-evaluation-runner.ts',
 'src/lib/knowledge/evaluation/ma24-evaluation-claim.ts',
 'src/lib/knowledge/evaluation/ma24-evaluation-task-binding.ts',
 'src/lib/assistant/main/graph.ts',
 'src/lib/assistant/main/tool-execution.ts',
 'src/lib/billing/paid-fetch.ts',
 'src/lib/knowledge/evaluation/ma24-persisted-run-binding.ts',
 'scripts/score-ma24-independent-comparison.ts',
])if(!sourceHashes[required])throw new Error(`MA24 runtime closure omits ${required}`);
const profile=modeModelConfig(mode).profile;
if(!profile)throw new Error('Mode profile unavailable');
console.log(JSON.stringify({schema:'ma24-g15-config-preview-v1',readOnly:true,simulation:true,
  previewDateUtc:promptDateUtc,productPromptDateUtc:promptDateUtc,
  mode,modePromptVersion:MODE_PROMPT_VERSION,modePromptSha256:hash(modePromptRules(mode)),
  productVersion:PRODUCT_VERSION,modelProfile:profile,
  modelFunctionsSha256:hash(JSON.stringify(modelFunctions)),arms,sourceHashes,
  sourceClosureMethod:'recursive-local-static-imports-v1',sourceClosureFileCount:Object.keys(sourceHashes).length,
  comparableModelRoutes:true,toolDeltaLimitedToVectorless:true,
  intendedLocalBgeFlagForBothArms:'ENABLE_MAIN_AGENT_LOCAL_BGE_SEARCH=1',
  currentLocalBgeFlagEnabled:process.env.ENABLE_MAIN_AGENT_LOCAL_BGE_SEARCH==='1',
  sourceSetFrozen:false,goldFrozen:false,runtimeBuildVerified:false,transitiveCodeClosureVerified:false,
  requiredRunPromptDateUtc:promptDateUtc,runPromptDateGateImplemented:true,
  baselineRetrievalProfileVerified:false,
  providerTariffsVerified:false,paidCallAuthorizationConfirmed:false,
  paidCallAuthorizationReference:null,
  maximumProviderRequests:null,maximumRequestBytes:null,maximumOutputTokens:null,
  hardSpendCapUsd:null,readyForPaidEvaluation:false,
  missing:['approved independent source and question set','coordinate-checked Gold hash',
    'candidate and baseline runtime/build identity and executed code closure binding','exact account and data scope',
    'main Agent baseline BGE plus full-text plus verified-fact wiring and a healthy local BGE service',
    'current provider tariffs and a durable per-call reservation rule',
    'request/output and spend ceilings with required authorization']},null,2));
