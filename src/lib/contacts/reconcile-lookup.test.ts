import { beforeEach,expect,it,vi } from 'vitest';
const query=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/rag/db',()=>({tenantTransaction:async(_u:string,run:(c:unknown)=>unknown)=>run({query})}));
import {reconcileContactLookup} from './reconcile-lookup';
beforeEach(()=>{query.mockReset();});
it('refuses fresh, finished, foreign or replaced reservations without any writes',async()=>{
  query.mockResolvedValue({rows:[]});await expect(reconcileContactLookup('owner','run')).rejects.toThrow('十分钟');
  expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0][0]).toContain("c.updated_at<now()-interval '10 minutes'");
  expect(query.mock.calls[0][0]).toContain('w.owner_id=$1');expect(query.mock.calls[0][0]).toContain('for update of c');
});
it('closes the old local run without refunding budget or starting another provider job',async()=>{
  query.mockResolvedValueOnce({rows:[{company_id:'company',provider:'fixture',workspace_id:'workspace'}]}).mockResolvedValue({rows:[]});
  expect(await reconcileContactLookup('owner','run')).toMatchObject({reconciled:true});
  expect(query.mock.calls[1][1]).toEqual(['owner','company','fixture','run']);
  expect(query.mock.calls.some(([sql])=>String(sql).includes('paid_call_reservation')||String(sql).includes('insert into company_enrichment_run'))).toBe(false);
  expect(query.mock.calls.at(-1)?.[1][3]).toContain('local-reconciliation-only-not-external-refund');
});
