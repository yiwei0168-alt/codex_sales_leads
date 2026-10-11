import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({session:vi.fn(),correct:vi.fn(),undo:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:mock.session}));
vi.mock('@/lib/knowledge/temporal-memory',()=>({memoryAt:vi.fn(),memoryConflicts:vi.fn(),memoryNotices:vi.fn(),memoryTimeline:vi.fn(),undoMemory:mock.undo}));
vi.mock('@/lib/knowledge/memory-correction',async importOriginal=>({...await importOriginal<typeof import('@/lib/knowledge/memory-correction')>(),correctMemory:mock.correct}));
import {POST} from './route';
const id='00000000-0000-4000-8000-000000000001';
const request=(body:unknown)=>new Request('http://localhost/api/knowledge/observations',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{mock.session.mockReset().mockResolvedValue({userId:'owner'});mock.correct.mockReset();mock.undo.mockReset();});
it('requires an authenticated account',async()=>{mock.session.mockResolvedValue(new Response('',{status:401}));
  expect((await POST(request({action:'correct',id,content:'Updated'}))).status).toBe(401);expect(mock.correct).not.toHaveBeenCalled();});
it('takes ownership and provenance from the server, never from request fields',async()=>{
  mock.correct.mockResolvedValue('new-id');const result=await POST(request({action:'correct',id,content:' Updated ',ownerId:'other',sourceReceipt:{verified:true}}));
  expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toContain('no-store');
  expect(mock.correct).toHaveBeenCalledWith('owner',{id,content:'Updated',reason:''});
});
it.each([['Memory target is unavailable',404],['Memory version changed',409],['Use original memory editor',409],['database private content',503]])('returns a safe failure for %s',async(message,status)=>{
  mock.correct.mockRejectedValue(new Error(message));const result=await POST(request({action:'correct',id,content:'Updated'}));
  expect(result.status).toBe(status);expect(JSON.stringify(await result.json())).not.toContain(message);
});
it('rejects empty correction before mutation',async()=>{expect((await POST(request({action:'correct',id,content:'  '}))).status).toBe(400);expect(mock.correct).not.toHaveBeenCalled();});
it('reports a stale undo instead of pretending to change the latest version',async()=>{mock.undo.mockRejectedValue(new Error('Memory version changed'));
  expect((await POST(request({action:'undo',id}))).status).toBe(409);});
it('accepts explicit nullable business dates but never caller knowledge time',async()=>{
  mock.correct.mockResolvedValue('new');const businessTime={validFrom:'2024-01-01T00:00:00Z',validUntil:null};
  expect((await POST(request({action:'correct',id,content:'Updated',businessTime,recordedAt:'2020-01-01'}))).status).toBe(200);
  expect(mock.correct).toHaveBeenCalledWith('owner',{id,content:'Updated',reason:'',businessTime});
});
it('rejects an inverted interval before calling the store',async()=>{
  expect((await POST(request({action:'correct',id,content:'Updated',businessTime:{validFrom:'2025-01-01T00:00:00Z',validUntil:'2024-01-01T00:00:00Z'}}))).status).toBe(400);
  expect(mock.correct).not.toHaveBeenCalled();
});
