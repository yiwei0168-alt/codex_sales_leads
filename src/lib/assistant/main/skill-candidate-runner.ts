import {z} from 'zod';
import {buildMainAgentGraph} from './graph';
import {digest,result,toolResultSchema,type ExecutionContext,type ModelMessage} from './contracts';
import {availableTools} from './tools';
import {resolveToolDispatch} from './tool-dispatch-resolution';
import {modelReplySchema} from './model';
import {modeConfigSchema,type ModeConfig} from './mode-config';
import {instructionOnlySkill} from './skills';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

type SkillListing={id:string;name:string;scope:string;current_version:number;enabled:boolean;published:boolean;owned:boolean};
type Snapshot={context:Pick<ExecutionContext,'userId'|'role'|'mode'|'knowledgeScope'>;
 initialMessages:ModelMessage[];profile:ModeConfig;skills:SkillListing[];
 candidate:{listing:SkillListing;value:{skill_id:string;version:number;files:Record<string,string>;content_hash:string;dependencies:unknown[];owner_id:string;scope:string;[key:string]:unknown}};
 receipts:Array<{tool:string;arguments:Record<string,unknown>;output:unknown;hash:string}>};
type Model=(input:{messages:ModelMessage[];profile:ModeConfig;step:number;signal:AbortSignal})=>Promise<unknown>;

/**
 * Isolated mechanism, not an authorization/production-equivalence claim. The
 * server collector must prepare/revalidate this snapshot and supply an authorized
 * durable model adapter. There is deliberately no business-tool dispatcher here.
 * Skill availability changes only through normal skill_list/skill_read results;
 * the original task and system prompts receive no replay or candidate instructions.
 */
export async function runSkillCandidateArm(input:Snapshot,arm:'baseline'|'candidate',model:Model,validateCurrent:()=>Promise<void>,maximumModelCalls=8){
 assertLocalAnalysisBoundary();z.number().int().min(1).max(64).parse(maximumModelCalls);
 const snapshot=structuredClone(input),profile=modeConfigSchema.parse(snapshot.profile),candidate=snapshot.candidate;
 if(profile.mode!==snapshot.context.mode||candidate.listing.scope!=='account'||candidate.listing.enabled||!candidate.listing.owned
  ||candidate.value.skill_id!==candidate.listing.id||candidate.value.scope!=='account'||candidate.value.owner_id!==snapshot.context.userId||candidate.listing.current_version!==candidate.value.version
  ||candidate.value.content_hash!==digest(candidate.value.files)||!instructionOnlySkill(candidate.value.files)||candidate.value.dependencies.length
  ||snapshot.skills.filter(row=>row.id===candidate.listing.id).length!==1
  ||digest(snapshot.skills.find(row=>row.id===candidate.listing.id))!==digest(candidate.listing))throw new Error('Candidate Skill snapshot ineligible');
 if(snapshot.initialMessages[0]?.role!=='system'||snapshot.initialMessages[1]?.role!=='system')throw new Error('Original task and decision memory required');
 const tools=availableTools(snapshot.context),described=new Set<string>(),seenCalls=new Set<string>();
 const skills=snapshot.skills.map(row=>row.id===candidate.listing.id?{...row,enabled:arm==='candidate'}:row);
 let calls=0,stopReason:string|null=null,candidateSkillUsed=false;
 const trace:Array<{id:string;name:string;argumentsHash:string;outputHash:string;receiptHash?:string}>=[];
 const check=async()=>{assertLocalAnalysisBoundary();await validateCurrent();};
 const graph=buildMainAgentGraph({
  boundary:async()=>{await check();return {control:stopReason?'pause':null,instructions:[]};},
  validateEvidence:check,
  model:async(messages,step)=>{
   await check();if(calls>=maximumModelCalls){stopReason='model-call-limit';throw new Error(stopReason);}calls++;
   const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{stopReason='model-deadline';reject(new Error(stopReason));controller.abort();},profile.totalMs);});
    const reply=modelReplySchema.parse(await Promise.race([model({messages:structuredClone([messages[0],snapshot.initialMessages[1],...messages.slice(1)]),profile:structuredClone(profile),step,signal:controller.signal}),deadline]));
    await check();
    if(!reply.content?.trim()&&!reply.tool_calls?.length)throw new Error('empty reply');
    for(const call of reply.tool_calls??[]){if(seenCalls.has(call.id))throw new Error('duplicate call');seenCalls.add(call.id);}
    return {...reply,content:reply.content??null};
   }catch{stopReason=stopReason??'model-or-source-unavailable';throw new Error(stopReason);}
   finally{clearTimeout(timer);controller.abort();}
  },
  tool:async call=>{
   await check();let receiptHash:string|undefined;
   const blocked=(reason:string)=>{stopReason=reason;return result(null,{status:'unavailable',missing:[reason]});};
   const dispatch=()=>{
    let args:unknown;try{args=JSON.parse(call.function.arguments);}catch{return blocked('invalid-call-json');}
    // Reject effects before schema parsing; never execute a registered tool.
    if(call.function.name==='execute_tool'&&typeof args==='object'&&args!==null&&'tool' in args){
     const requested=tools.find(row=>row.id===args.tool);
     if(!requested||requested.effect!=='read')return blocked('effect-or-tool-not-allowed');
    }
    const resolved=resolveToolDispatch(call,snapshot.context);
    if(resolved.kind==='return'){
     if(resolved.rejected)return blocked(resolved.rejected);
     if(resolved.describedToolId)described.add(resolved.describedToolId);
     return resolved.output;
    }
    const {tool,input}=resolved;
    if(tool.effect!=='read')return blocked('effect-or-tool-not-allowed');
    if(!described.has(tool.id))return blocked('tool-not-described');
    if(tool.id==='skill_list')return result(structuredClone(skills),{cost:'known'});
    if(tool.id==='skill_read'&&(input as {id?:string}).id===candidate.listing.id){
     if(arm==='baseline')return result(null,{cost:'known'});
     candidateSkillUsed=true;return result(structuredClone(candidate.value),{cost:'known'});
    }
    const matches=snapshot.receipts.filter(row=>row.tool===tool.id&&digest(row.arguments)===digest(input));
    if(matches.length!==1)return blocked('no-unique-recorded-receipt');
    const receipt=matches[0];
    if(receipt.hash!==digest({tool:receipt.tool,arguments:receipt.arguments,output:receipt.output}))return blocked('receipt-changed');
    receiptHash=receipt.hash;return toolResultSchema.parse(structuredClone(receipt.output));
   };
   const output=dispatch();await check();
   trace.push({id:call.id,name:call.function.name,argumentsHash:digest(call.function.arguments),outputHash:digest(output),...(receiptHash?{receiptHash}:{})});return output;
  },
 });
 await check();
 const final=await graph.invoke({messages:[snapshot.initialMessages[0],...snapshot.initialMessages.slice(2)],pending:[],steps:0,status:'running',reply:'',seen:{},instructionIds:[],decisionRevision:0,policyRevision:''},{recursionLimit:maximumModelCalls*32});
 await check();
 return {protocol:'skill-instruction-overlay-v1',arm,status:final.status,reply:final.reply,messages:final.messages,
  inputHash:digest(snapshot),profileHash:digest(profile),candidateContentHash:candidate.value.content_hash,
  modelCalls:calls,trace,stopReason,candidateSkillUsed,businessToolExecutions:0,
  productionGraphReused:true,productionAgentEquivalent:false,collectorProvenanceVerified:false,automaticActivation:false};
}
