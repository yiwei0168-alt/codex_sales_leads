import {afterEach,expect,it,vi} from 'vitest';
import {compactCapabilityCatalog} from './capability-catalog';
import {availableTools} from './tools';
import {initialTaskMessages} from './initial-task-messages';
import {automaticModelConfig} from './automatic-execution';
afterEach(()=>vi.unstubAllEnvs());
const context={userId:'owner',role:'member' as const,mode:'deep' as const};
it('retains every authorized capability ID/effect while deferring detailed descriptions',()=>{
 const tools=availableTools(context),catalog=compactCapabilityCatalog(tools);
 for(const tool of tools)expect(catalog).toContain(`${tool.id} [${tool.effect}; ${tool.cost}]:`);
 expect(catalog.length).toBeLessThan(tools.map(t=>`${t.id}: ${t.description}`).join('\n').length);
 const knowledge=availableTools({...context,mode:'quick'});
 expect(compactCapabilityCatalog(knowledge)).not.toContain('mail_send [');
});
it('opts in only for hybrid automatic jobs, retaining full wrapper schemas and legacy baseline',()=>{
 vi.stubEnv('HYBRID_COMPACT_CATALOG','1');vi.stubEnv('ENABLE_HYBRID_EXECUTION','1');
 const input={content:'统计已导入邮件',attachments:[]},config=automaticModelConfig();
 const messages=initialTaskMessages(context,input,config,[]);
 expect(messages[0].content).toContain('[capability-catalog-v2:compact]');
 expect(messages.some(m=>m.content?.includes('以下编排入口的完整契约已经提供'))).toBe(true);
 vi.stubEnv('ENABLE_HYBRID_EXECUTION','0');
 expect(initialTaskMessages(context,input,config,[])[0].content).not.toContain('[capability-catalog-v2:compact]');
});
