import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AgentApprovals} from './agent-approvals';
import type {AgentApproval} from '@/lib/assistant/main/approvals';
const item:AgentApproval={id:'approval',run_id:'run',tool_id:'knowledge_private_delete',tool_version:'1',parameter_hash:'a'.repeat(64),
 payload:{documentId:'11111111-1111-4111-8111-111111111111',expectedHash:'b'.repeat(64)},status:'pending',expires_at:'2026-10-22T00:00:00Z'};
it('shows a server-resolved name and deletion scope while keeping exact parameters in details',()=>{
 const html=renderToStaticMarkup(<AgentApprovals items={[{...item,target:{kind:'private-knowledge',state:'current',title:'Team notes <2026>'}}]}/>);
 expect(html).toContain('Team notes &lt;2026&gt;');expect(html).toContain('将永久删除这份私有资料及其检索片段');expect(html).toContain('工具参数与版本详情');expect(html).toContain('documentId');
});
it('explains stale content and unavailable targets instead of claiming they are verified',()=>{
 const stale=renderToStaticMarkup(<AgentApprovals items={[{...item,target:{kind:'private-knowledge',state:'changed',title:'Changed notes'}}]}/>);
 expect(stale).toContain('资料版本已变化');
 const missing=renderToStaticMarkup(<AgentApprovals items={[item]}/>);expect(missing).toContain('当前无法核对这份私有资料');expect(missing).not.toContain('将永久删除这份私有资料及其检索片段');
});
