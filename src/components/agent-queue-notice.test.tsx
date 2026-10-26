import {expect,it} from 'vitest';import {renderToStaticMarkup} from 'react-dom/server';import {AgentQueueNotice} from './agent-queue-notice';
it('explains saved work without asserting an offline service',()=>{
 const html=renderToStaticMarkup(<AgentQueueNotice status="queued" waitMs={60_000}/>);
 expect(html).toContain('任务已保存');expect(html).toContain('无需重复提交');expect(html).toContain('可能繁忙或暂不可用');
});
it('does not mislabel short, stale, scheduled, malformed or supplier-batch waits',()=>{
 for(const props of [{status:'queued',waitMs:59_999},{status:'queued',waitMs:0},{status:'queued',waitMs:NaN},{status:'queued',waitMs:Infinity},{status:'queued',waitMs:80_000,current:false},{status:'queued',waitMs:80_000,pendingBatch:true},{status:'running',waitMs:80_000},{status:'completed',waitMs:80_000}])
  expect(renderToStaticMarkup(<AgentQueueNotice {...props}/>)).toBe('');
});
