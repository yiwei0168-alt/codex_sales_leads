import {productTools} from './tools';
import type {ExecutionContext,ModelToolCall,ToolResult} from './contracts';
import {executeRegisteredTool} from './tool-execution';
import {resolveToolDispatch} from './tool-dispatch-resolution';
export {executeRegisteredTool} from './tool-execution';

export async function dispatchTool(call:ModelToolCall,context:ExecutionContext,tools=productTools):Promise<ToolResult>{
 if(context.skillTaskSpecHash){const {assertSkillCandidateRuntimeTaskContext}=await import('./skill-candidate-runtime-task');await assertSkillCandidateRuntimeTaskContext(context);}
 const resolved=resolveToolDispatch(call,context,tools);
 if(resolved.kind==='return')return resolved.output;
 return executeRegisteredTool(resolved.tool,resolved.input,call.id,context);
}
