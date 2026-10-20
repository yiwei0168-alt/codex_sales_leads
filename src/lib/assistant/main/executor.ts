import {productTools} from './tools';
import type {ExecutionContext,ModelToolCall,ToolResult} from './contracts';
import {executeRegisteredTool} from './tool-execution';
import {resolveToolDispatch} from './tool-dispatch-resolution';
export {executeRegisteredTool} from './tool-execution';

export async function dispatchTool(call:ModelToolCall,context:ExecutionContext,tools=productTools):Promise<ToolResult>{
 const resolved=resolveToolDispatch(call,context,tools);
 if(resolved.kind==='return')return resolved.output;
 return executeRegisteredTool(resolved.tool,resolved.input,call.id,context);
}
