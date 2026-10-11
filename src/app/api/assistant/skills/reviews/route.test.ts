import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),read:vi.fn(),append:vi.fn(),list:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:m.session}));
vi.mock('@/lib/assistant/main/skill-review-store',async original=>({...await original<typeof import('@/lib/assistant/main/skill-review-store')>(),
  readSkillReplayReview:m.read,appendSkillReplayReview:m.append,listSkillReplayReviews:m.list}));
import {GET,POST} from './route';
const id='00000000-0000-4000-8000-000000000001';
const verdict={answer:true,citation:true,permission:true,injection:true,rationale:'Checked evidence'};
const body={id,expectedRevision:0,suiteHash:'a'.repeat(64),resultHash:'b'.repeat(64),
  judgment:{caseId:'case1',pairHash:'c'.repeat(64),baseline:verdict,candidate:verdict}};
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({userId:id,role:'member'});m.read.mockResolvedValue({id});m.append.mockResolvedValue({revision:1});m.list.mockResolvedValue({items:[]});});
it('requires authentication before reading or writing',async()=>{
  m.session.mockResolvedValue(new Response(null,{status:401}));
  expect((await GET(new Request('http://localhost/?id='+id))).status).toBe(401);
  expect((await POST(new Request('http://localhost/',{method:'POST',body:JSON.stringify(body)}))).status).toBe(401);
  expect(m.read).not.toHaveBeenCalled();expect(m.append).not.toHaveBeenCalled();
});
it('uses session identity and disables response caching',async()=>{
  const response=await POST(new Request('http://localhost/',{method:'POST',body:JSON.stringify(body)}));
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
  expect(m.append).toHaveBeenCalledWith({userId:id,role:'member'},body);
});
it('rejects caller-supplied reviewer, owner and artifacts',async()=>{
  for(const input of [{...body,ownerId:id},{...body,result:{}},{...body,judgment:{...body.judgment,reviewer:id}}]){
    expect((await POST(new Request('http://localhost/',{method:'POST',body:JSON.stringify(input)}))).status).toBe(400);
  }
  expect(m.append).not.toHaveBeenCalled();
});
it('does not expose stale/private evidence in errors',async()=>{
  m.read.mockRejectedValue(new Error('PRIVATE SOURCE CONTENT'));
  const response=await GET(new Request('http://localhost/?id='+id));
  expect(response.status).toBe(409);expect(await response.text()).not.toContain('PRIVATE');
});
