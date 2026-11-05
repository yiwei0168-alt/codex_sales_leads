import {afterEach, expect, it, vi} from 'vitest';
import {availableTools} from './tools';
import {initialTaskMessages} from './initial-task-messages';
import {modeModelConfig} from './mode-config';
import {resolveToolDispatch} from './tool-dispatch-resolution';
import {hybridFirstAction} from './hybrid-routing';
import {hybridTools} from './hybrid-tools';

afterEach(()=>vi.unstubAllEnvs());
const context={userId:'owner',role:'member' as const,mode:'quick' as const};
const input={content:'查看 Atlas 最新进展',attachments:[]};
it('provides executable schemas and a fresh-only route marker without rewriting the question',()=>{
 const messages=initialTaskMessages(context,input,modeModelConfig('quick'),[]);
 expect(messages.at(-1)?.content).toBe(input.content);
 expect(hybridFirstAction(messages)?.tool_calls).toHaveLength(1);
 expect(messages.some(m=>m.content?.includes('programmatic_read')&&m.content.includes('inputSchema'))).toBe(true);
 const action=hybridFirstAction(messages)!.tool_calls![0];
 expect(resolveToolDispatch(action,context).kind).toBe('execute');
});
it('does not shortcut followups, attachments or scoped knowledge questions',()=>{
 for(const messages of [
  initialTaskMessages(context,input,modeModelConfig('quick'),[{role:'assistant',content:'previous'}]),
  initialTaskMessages(context,{...input,attachments:[{assetId:'11111111-1111-4111-8111-111111111111'}]},modeModelConfig('quick'),[]),
  initialTaskMessages({...context,knowledgeScope:['product']},{...input,knowledgeScope:['product']},modeModelConfig('quick'),[]),
 ])expect(hybridFirstAction(messages)).toBeNull();
});
it('disables wrappers and first-action route with the rollback flag',()=>{
 vi.stubEnv('ENABLE_HYBRID_EXECUTION','0');
 expect(availableTools(context,hybridTools)).toEqual([]);
 expect(hybridFirstAction(initialTaskMessages(context,input,modeModelConfig('quick'),[]))).toBeNull();
});
it('does not change historical independent-evaluation capability inventories',()=>{
 expect(availableTools({...context,evaluationArm:'candidate',knowledgeScope:['product']},hybridTools)).toEqual([]);
});
it('knowledge scope exposes wrappers but not underlying mail capabilities',()=>{
 const ids=availableTools({...context,knowledgeScope:['product']}).map(tool=>tool.id);
 expect(ids).toContain('programmatic_read');expect(ids).not.toContain('mail_read');
});
