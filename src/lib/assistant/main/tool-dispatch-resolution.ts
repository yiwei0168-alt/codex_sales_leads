import {z} from 'zod';
import {availableTools,describeTool,productTools} from './tools';
import {result,type ExecutionContext,type ModelToolCall,type ProductTool,type ToolResult} from './contracts';
import {modeAllowsTool} from './mode-tools';

type Context=Pick<ExecutionContext,'userId'|'role'|'mode'|'knowledgeScope'|'evaluationArm'>;
type Resolution={kind:'return';output:ToolResult;rejected?:string;describedToolId?:string}
 |{kind:'execute';tool:ProductTool;input:unknown};
const invocation=z.object({tool:z.string().max(120),arguments:z.record(z.string(),z.unknown())}).strict();

/** Shared model-facing resolution only. No execution, journal or approval. */
export function resolveToolDispatch(call:ModelToolCall,context:Context,tools=productTools):Resolution{
 const reject=(rejected:string,output:ToolResult):Resolution=>({kind:'return',output,rejected});
 let parsed:unknown;
 try{parsed=JSON.parse(call.function.arguments);}catch{return reject('invalid-call-json',result(null,{status:'missing_input',missing:['Valid JSON arguments required']}));}
 const allowed=availableTools(context,tools);
 if(call.function.name==='discover_tools')return {kind:'return',output:result(allowed.map(t=>({id:t.id,description:t.description,effect:t.effect,cost:t.cost})),{cost:'known'})};
 if(call.function.name==='describe_tool'){
  const p=z.object({tool:z.string()}).strict().safeParse(parsed),tool=p.success?allowed.find(t=>t.id===p.data.tool):undefined;
  return tool?{kind:'return',output:result(describeTool(tool),{cost:'known'}),describedToolId:tool.id}
   :reject('tool-not-accessible',result(null,{status:'unavailable',missing:['Registered accessible tool']}));
 }
 const p=invocation.safeParse(parsed);
 if(call.function.name!=='execute_tool'||!p.success)return reject('invalid-execution-input',result(null,{status:'missing_input',missing:['execute_tool requires tool and arguments; server identity cannot be supplied']}));
 if(p.data.tool==='workspace_mode_update')return reject('capability-removed',result({code:'capability_removed'},{status:'unavailable',cost:'known',missing:['全局市场模式能力已移除；此历史调用未执行。请使用具体任务的业务目标。']}));
 if(!modeAllowsTool(context.mode,p.data.tool))return reject('tool-not-accessible',result(null,{status:'unavailable',missing:['当前模式不支持此操作，请手动切换模式后新建任务。']}));
 const tool=allowed.find(t=>t.id===p.data.tool);
 if(!tool)return reject('tool-not-accessible',result(null,{status:'unavailable',missing:['Registered accessible tool']}));
 const input=tool.input.safeParse(p.data.arguments);
 if(!input.success)return reject('tool-schema-mismatch',result(null,{status:'missing_input',missing:input.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`)}));
 return {kind:'execute',tool,input:input.data};
}
