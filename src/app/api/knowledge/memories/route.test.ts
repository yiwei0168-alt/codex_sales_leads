import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),change:vi.fn(),list:vi.fn(),save:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:m.session}));
vi.mock('@/lib/outreach/memory-management',async original=>({...await original<typeof import('@/lib/outreach/memory-management')>(),changeMemory:m.change,listMemories:m.list}));
vi.mock('@/lib/outreach/memory-save',()=>({saveManualMemory:m.save}));
import {PATCH} from './route';
const id='11111111-1111-4111-8111-111111111111',body={id,operation:'delete',confirmed:true,expectedUpdatedAt:'observed-version'};
const patch=(data:unknown=body)=>PATCH(new Request('http://localhost/api/knowledge/memories',{method:'PATCH',body:JSON.stringify(data)}));
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({userId:'session-owner'});m.change.mockResolvedValue('ok');});
it('does not acknowledge a rejected stale version as success',async()=>{
 m.change.mockResolvedValue('conflict');const response=await patch();expect(response.status).toBe(409);expect(response.headers.get('cache-control')).toContain('private, no-store');
 expect(await response.json()).toEqual({error:expect.stringContaining('已变化')});expect(m.change).toHaveBeenCalledExactlyOnceWith('session-owner',body);
});
it('accepts a successful exact-version action and preserves existing missing/source-managed failures',async()=>{
 expect((await patch()).status).toBe(200);m.change.mockResolvedValue('not-found');expect((await patch()).status).toBe(404);m.change.mockResolvedValue('source-managed');expect((await patch()).status).toBe(409);
});
it('requires authentication and explicit confirmation; rejects forged ownership',async()=>{
 m.session.mockResolvedValue(new Response('',{status:401}));expect((await patch()).status).toBe(401);expect(m.change).not.toHaveBeenCalled();
 m.session.mockResolvedValue({userId:'session-owner'});expect((await patch({...body,confirmed:false})).status).toBe(400);expect((await patch({...body,userId:'other'})).status).toBe(400);expect(m.change).not.toHaveBeenCalled();
});
it('keeps storage errors private and does not report success',async()=>{
 m.change.mockRejectedValue(new Error('PRIVATE database contents'));const response=await patch();expect(response.status).toBe(503);expect(await response.text()).not.toContain('PRIVATE');
});
