import { beforeEach,expect,it,vi } from 'vitest';
const query=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/rag/db',()=>({tenantTransaction:async(_u:string,run:(c:unknown)=>unknown)=>run({query})}));
import {reconcileRelationshipAnalysis} from './reconcile-relationship';
beforeEach(()=>{query.mockReset();});
it('never resets completed, recent-running, foreign or already reconciled analysis',async()=>{
  query.mockResolvedValue({rows:[]});await expect(reconcileRelationshipAnalysis('owner','id')).rejects.toThrow('不可重置');
  expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0][0]).toContain("not (a.metrics ? 'userReconciled')");
  expect(query.mock.calls[0][0]).toContain("interval '10 minutes'");
});
it('preserves the old attempt and archives its key without erasing evidence or starting another model call',async()=>{
  query.mockResolvedValueOnce({rows:[{workspace_id:'workspace',fingerprint:'relation-v1:model:hash'}]}).mockResolvedValue({rows:[]});
  expect(await reconcileRelationshipAnalysis('owner','id')).toMatchObject({reconciled:true});
  expect(query.mock.calls[1][1][2]).toBe('closed:id:relation-v1:model:hash');
  expect(query.mock.calls[1][0]).toContain('metrics=metrics ||');
  expect(query.mock.calls.some(([sql])=>String(sql).includes('delete ')||String(sql).includes('insert into user_relationship_analysis'))).toBe(false);
});
