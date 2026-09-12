// Diagnostic only. Frozen input -> current request builders -> mocked transport -> no-network Docker.
// No database, search, provider request, raw payload file, or product mutation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { LeadEvidenceCorrectionAgent } from '../../src/lib/leads/workflow/evidence-correction-agent';
import { LeadQualificationAgent } from '../../src/lib/leads/workflow/qualification-agent';
import { buildStandardLeadMarketPlaybook } from '../../src/lib/leads/workflow/playbook';
import { DeepSeekProvider } from '../../src/providers/deepseek';
import type { AiProvider, StructuredAiRequest } from '../../src/providers/contracts';
import type { LeadSearchPlan } from '../../src/lib/assistant/types';
import type { CorrectedLeadWorkflowCandidate, LeadWorkflowCandidate } from '../../src/lib/leads/workflow/types';

const partNames = ['system', 'user', 'input', 'outerEvidenceIds', 'instructions', 'scoringRubric', 'candidateEvidence', 'findings'] as const;
type InputParts = { instructions: unknown; scoringRubric?: unknown; candidates: Array<{evidence:unknown;findings?:unknown}> };
type Measured = {stage:string;kind:string;companies:number;bytes:number;total:number;parts:number[];repeat_stable:boolean};
const stats = (values:number[]) => { const s=[...values].sort((a,b)=>a-b);return {min:s[0],p50:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1],max:s.at(-1),sum:s.reduce((a,b)=>a+b,0)}; };

async function main() {
  const started=performance.now();
  globalThis.fetch=async()=>{throw new Error('Network prohibited');};
  const root='experiments/multi-source-lead-discovery/artifacts/runs/2026-08-30-de-v2-tools-full/role-aware-v2';
  const sourceBytes=['fresh-evidence-snapshot.json','corrected-candidates.json'].map(f=>readFileSync(`${root}/${f}`));
  const raw:LeadWorkflowCandidate[]=JSON.parse(sourceBytes[0].toString()).candidates;
  const corrected:CorrectedLeadWorkflowCandidate[]=JSON.parse(sourceBytes[1].toString()).candidates;
  if(raw.length!==207||corrected.length!==207)throw new Error('Unexpected sample count');
  const plan:LeadSearchPlan={countryCode:'DE',countryName:'Germany',objective:'existing-distributor-growth',roles:[],targetCount:207,queryLanguage:'en',userRequest:'Offline sizing only'};
  const playbook=buildStandardLeadMarketPlaybook(plan,[]);
  const stub={id:'offline',execute:async()=>{throw new Error('Agent execution prohibited');}} as unknown as AiProvider;
  type Builder={request:(...args:never[])=>StructuredAiRequest<InputParts>};
  const invoke=(agent:unknown,args:unknown[])=>(agent as Builder).request(...args as never[]);
  const correction=new LeadEvidenceCorrectionAgent(stub,{search:async()=>{throw new Error('Search prohibited');}} as never);
  const cases=[{stage:'correction',candidates:raw,limit:28000,bound:36864,build:(c:LeadWorkflowCandidate[])=>invoke(correction,[c,plan,'deepseek-v4-pro'])},
    ...[false,true].map(paths=>{const agent=new LeadQualificationAgent(stub,{includeCooperationPaths:paths});return {stage:paths?'score-and-paths':'score-only',candidates:corrected,limit:42000,bound:paths?61440:57344,build:(c:LeadWorkflowCandidate[])=>invoke(agent,[c,playbook,'DE','Germany',plan.objective,'deepseek-v4-pro'])};})];
  let wire='';
  const provider=new DeepSeekProvider({apiKey:'offline-dummy',baseUrl:'https://offline.invalid',maxAttempts:1,
    fetchImplementation:async(_url,init)=>{wire=String(init?.body);return new Response(JSON.stringify({content:[{type:'text',text:'{}'}],stop_reason:'end_turn',choices:[{finish_reason:'stop',message:{content:'{}'}}]}),{status:200});}});
  const lines:string[]=[];
  const metadata:Array<Omit<Measured,'total'|'parts'|'repeat_stable'>>=[];
  const configurations=new Set<string>();
  for(const item of cases){
    const batches:LeadWorkflowCandidate[][]=[];let pending:LeadWorkflowCandidate[]=[];
    for(const candidate of item.candidates){const proposed=[...pending,candidate];if(pending.length&&(proposed.length>5||JSON.stringify(item.build(proposed).input).length>item.limit)){batches.push(pending);pending=[];}pending.push(candidate);}
    if(pending.length)batches.push(pending);
    for(const [kind,groups] of [['single',item.candidates.map(c=>[c])],['batch',batches]] as const){
      for(const group of groups){
        const request=item.build(group);await provider.execute(request);
        const body=JSON.parse(wire);
        const system=body.system??body.messages.find((m:{role:string})=>m.role==='system').content;
        const user=body.messages.find((m:{role:string})=>m.role==='user').content;
        configurations.add(JSON.stringify({protocol:body.system?'messages':'chat',model:body.model,thinking:body.thinking,outputCap:body.max_tokens}));
        const input=request.input;
        const parts=[system,user,JSON.stringify(input),JSON.stringify(request.evidenceIds),JSON.stringify(input.instructions),JSON.stringify(input.scoringRubric??null),JSON.stringify(input.candidates.map(c=>c.evidence)),JSON.stringify(input.candidates.map(c=>c.findings??[]))];
        lines.push(JSON.stringify({body,parts}));metadata.push({stage:item.stage,kind,companies:group.length,bytes:Buffer.byteLength(wire)});
      }
    }
  }
  const encodeStarted=performance.now();
  const result=spawnSync('docker',['run','--rm','-i','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','65534:65534','sales-tokenizer-audit:20260913','--stdin'],
    {input:lines.join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024,timeout:300000,windowsHide:true});
  if(result.status!==0)throw new Error('Offline Docker failed'); // Never print raw stderr/payload.
  const encoded=result.stdout.trim().split('\n').map(line=>JSON.parse(line));
  if(encoded.length!==metadata.length||encoded.some(x=>!x.repeat_stable||!Number.isSafeInteger(x.total)||x.parts.length!==partNames.length))throw new Error('Result validation failed');
  const rows:Measured[]=metadata.map((m,i)=>({...m,...encoded[i]}));
  const output=cases.map(item=>({stage:item.stage,configuredBodyBound:item.bound,groups:['single','batch'].map(kind=>{const r=rows.filter(x=>x.stage===item.stage&&x.kind===kind);return {kind,requests:r.length,companies:r.reduce((s,x)=>s+x.companies,0),bodyBytes:stats(r.map(x=>x.bytes)),overBodyBound:r.filter(x=>x.bytes>item.bound).length,totalTokens:stats(r.map(x=>x.total)),isolatedPartTokens:Object.fromEntries(partNames.map((name,i)=>[name,stats(r.map(x=>x.parts[i]))]))};})}));
  console.log(JSON.stringify({scope:'current-request-reconstruction-standard-playbook-no-original-rag-or-private-memory-not-historical-billing',sourceSha256:sourceBytes.map(b=>createHash('sha256').update(b).digest('hex')),configurations:[...configurations].map(s=>JSON.parse(s)),requests:rows.length,partNames,partAccounting:'isolated encodings overlap/nest and are NOT additive; null/empty placeholders have tokens',dockerWallMs:Math.round(performance.now()-encodeStarted),totalWallMs:Math.round(performance.now()-started),modelCalls:0,modelCostUsd:0,output},null,2));
}
main().catch(()=>{console.error('Offline frozen audit failed; payload suppressed');process.exitCode=1;});
