import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {buildMainAgentGraph} from '../../src/lib/assistant/main/graph';
import {initialTaskMessages} from '../../src/lib/assistant/main/initial-task-messages';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {requestModeModel} from '../../src/lib/assistant/main/model';
import {resolveToolDispatch} from '../../src/lib/assistant/main/tool-dispatch-resolution';
import {productTools} from '../../src/lib/assistant/main/tools';
import {executeProgrammatic} from '../../src/lib/assistant/main/programmatic-execution';
import {programDecisionHint} from '../../src/lib/assistant/main/program-decision-routing-v4';
import {requestProgramDecision} from '../../src/providers/program-decisions-v4';
import {programResponseSchema,programRoute} from '../../src/providers/program-decision-contract-v4';
import policy from '../../config/agent/jev-program-policy-v4.json';
import {result,digest,type ExecutionContext,type ModelToolCall,type ToolResult} from '../../src/lib/assistant/main/contracts';
import {once} from '../jev-routing-optimization/receipts';

// Actual model/graph/WASM integration, isolated synthetic tool data; never business DB execution.
const directory='.local-runtime/program-pilot-v2-20261109';
const request='分别读取 Atlas（candidateId=fixture-atlas）、Birch（candidateId=fixture-birch）、Cedar（candidateId=fixture-cedar）已有的公司记录，按已保存分数从高到低列出名称、分数、更新时间，每家公司保留对应来源链接。不要生成新评分，不做原因解释或写入。';
const fixtures=[['Atlas',63,'2026-10-30'],['Birch',88,'2026-11-02'],['Cedar',74,'2026-10-28']] as const;
const context:ExecutionContext={userId:'synthetic-only',runId:'synthetic-pilot',leaseToken:'synthetic',role:'member',mode:'quick'};
const config=modeModelConfig('quick');
const tools=productTools.filter(t=>['company_read','programmatic_tools'].includes(t.id));
const format=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
const sources=['experiments/program-pilot-v2/run.ts','src/lib/assistant/main/graph.ts','src/lib/assistant/main/programmatic-execution.ts',
  'src/lib/assistant/main/program-decision-routing-v4.ts','src/providers/program-decision-contract-v4.ts','config/agent/jev-program-policy-v4.json','src/lib/assistant/main/initial-task-messages.ts','docs/evidence/program-pilot-2026-11-09.json'];

async function run(arm:'baseline'|'hybrid',manifestHash:string){
  const path=`${directory}/${arm}`;await mkdir(path,{recursive:true});
  let modelCalls=0,leafCalls=0,programs=0,route:string|null=null;
  const leaves=new Map<string,ToolResult>(),trace:unknown[]=[];
  const dispatch=async(call:ModelToolCall):Promise<ToolResult>=>{
    const resolved=resolveToolDispatch(call,context,arm==='hybrid'?tools:tools.filter(t=>t.id==='company_read'));
    if(resolved.kind==='return')return resolved.output;
    const {tool,input}=resolved;
    if(tool.id==='company_read'){
      if(leaves.has(call.id))return leaves.get(call.id)!;
      const args=input as {candidateId:string},item=fixtures.find(f=>`fixture-${f[0].toLowerCase()}`===args.candidateId);
      if(!item)return result(null,{status:'missing_input',missing:['Synthetic fixture ID not found']});
      if(++leafCalls>6)throw Error('Pilot leaf limit');
      const output=result([{candidate_id:args.candidateId,market_country_code:'GB',revision:'1',updated_at:item[2],
        record:{companyName:item[0],savedScore:item[1],note:'Synthetic test record, not a real business fact.'}}],
        {cost:'known',sources:[{title:`${item[0]} synthetic source`,url:`https://example.invalid/${item[0].toLowerCase()}`} ]});
      leaves.set(call.id,output);trace.push({tool:tool.id,input,output});return output;
    }
    if(tool.id!=='programmatic_tools'||arm!=='hybrid')throw Error('Unexpected executable tool');
    if(++programs>2)throw Error('Pilot program limit');
    trace.push({tool:tool.id,input});
    return executeProgrammatic(input,{...context,callId:'11111111-1111-4111-8111-111111111111'},{allowed:new Set(['company_read']),dispatch,
      validate:async saved=>{if(saved.some(l=>!leaves.has(l.key)||digest(l.output)!==digest(leaves.get(l.key))))throw Error('Synthetic source mismatch');}});
  };
  let messages=initialTaskMessages(context,{content:request,attachments:[]},config,[]);
  // Restrict both arms to the same fixture data and actual reviewed schemas.
  if(arm==='baseline')messages=messages.filter(m=>m.role!=='system'||!m.content?.startsWith('[hybrid-'));
  messages[0]={role:'system',content:'You are testing an isolated product graph with synthetic records. Only company_read is available'+
    (arm==='hybrid'?' plus programmatic_tools for program segments.':'')+' Discover/describe registered tools as needed. Return a complete concise Chinese answer with source links. Do not invent facts. No external search or business writes.'};
  if(arm==='hybrid'){
    const r=await once(`${path}/router.json`,digest({manifestHash,request}),()=>requestProgramDecision({request,hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false,mode:'quick'}));
    route=r.status==='completed'?programRoute(programResponseSchema.parse(r.response),policy,{request,hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false,mode:'quick'}):'dynamic_agent';
  }
  const started=Date.now();
  const graph=buildMainAgentGraph({boundary:async()=>({control:null,instructions:[]}),
    prepareRoute:async()=>route?programDecisionHint(route as 'fixed_workflow'|'interpreter'|'dynamic_agent'):null,
    model:async(input,step)=>{
      if(++modelCalls>6)throw Error('Pilot model call limit');
      const receipt=await once(`${path}/model-${step}.json`,digest({manifestHash,arm,input,profile:config.profile}),
        ()=>requestModeModel(input,config.profile!,0));
      if(receipt.status!=='completed')throw Error('Unknown model attempt; not retried');
      const response=receipt.response as Awaited<ReturnType<typeof requestModeModel>>;
      trace.push({step,generationId:response.generationId,usage:response.usage,message:response.message});return response.message;
    },tool:dispatch},false);
  const output=await graph.invoke({messages,pending:[],steps:0,status:'running',reply:'',seen:{},instructionIds:[],decisionRevision:0,policyRevision:''},{recursionLimit:70});
  const complete=fixtures.every(([name,score,date])=>output.reply.includes(name)&&output.reply.includes(String(score))&&output.reply.includes(date)
    &&output.reply.includes(`https://example.invalid/${name.toLowerCase()}`));
  const rank=['Birch','Cedar','Atlas'].map(name=>output.reply.indexOf(name));
  const ordered=rank[0]>=0&&rank[0]<rank[1]&&rank[1]<rank[2];
  const report={arm,status:output.status,route,modelCalls,leafCalls,programs,graphWallMs:Date.now()-started,complete,ordered,
    passed:output.status==='completed'&&complete&&ordered&&(arm==='baseline'||programs>0),syntheticToolData:true,realBusinessAccepted:false,reply:output.reply};
  await writeFile(`${path}/trace.json`,format({report,trace,messages:output.messages}));
  return report;
}
async function main(){
  await mkdir(directory,{recursive:true});
  const command=process.argv[2];
  if(command==='freeze'){
    const hashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,digest(await readFile(p,'utf8'))])));
    await writeFile('experiments/program-pilot-v2/manifest.json',format({version:'program-pilot-v2',sources:hashes,request,model:config.profile!.routes[0],maxModelCalls:6,maxJevCalls:1,retries:0,
      fixtureDataOnly:true,productionSwitch:false,qualityGate:'all three facts, dates, URLs; descending order; hybrid must execute a real WASM program'}),{flag:'wx'});return;
  }
  const manifest=JSON.parse(await readFile('experiments/program-pilot-v2/manifest.json','utf8'));
  for(const [p,hash]of Object.entries(manifest.sources))if(digest(await readFile(p,'utf8'))!==hash)throw Error(`Frozen source drift: ${p}`);
  if(command!=='run')throw Error('Use freeze or run');
  const baseline=JSON.parse(await readFile('docs/evidence/program-pilot-2026-11-09.json','utf8')).reports.find((r:{arm:string})=>r.arm==='baseline');
  const reports=[baseline,await run('hybrid',digest(manifest))];
  const report={protocol:'program-pilot-v2',synthetic:true,actualProvider:true,productionDatabaseAccess:false,productionActivated:false,baselineReused:true,reports,passed:reports.every(r=>r.passed)};
  await writeFile('docs/evidence/program-pilot-v2-2026-11-09.json',format(report));console.log(format(report));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Pilot failed');process.exitCode=1;});
