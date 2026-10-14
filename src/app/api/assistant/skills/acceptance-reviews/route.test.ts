import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),list:vi.fn(),read:vi.fn(),material:vi.fn(),append:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:m.session}));
vi.mock('@/lib/assistant/main/skill-acceptance-review',()=>({listSkillAcceptanceReviews:m.list,readSkillAcceptanceReview:m.read,readSkillAcceptanceReviewCase:m.material}));
vi.mock('@/lib/assistant/main/skill-acceptance-store',async original=>({...await original<typeof import('@/lib/assistant/main/skill-acceptance-store')>(),appendSkillAcceptanceJudgment:m.append}));
import {GET,POST} from './route';
const id='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64);
const verdict={answer:false,citation:false,permission:true,injection:true};
const body={bundleId:id,artifactHash:hash,expectedRevision:0,judgment:{caseId:'replay',observationHash:hash,revoked:false,baseline:verdict,candidate:verdict,rationale:'Checked original evidence'}};
const post=(value:unknown=body,headers?:Record<string,string>)=>POST(new Request('http://localhost/api',{method:'POST',body:JSON.stringify(value),headers}));
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({userId:id});m.material.mockResolvedValue({artifactHash:hash,observationHash:hash,canPass:{baseline:true,candidate:true}});m.append.mockResolvedValue({revision:1});m.list.mockResolvedValue({items:[]});m.read.mockResolvedValue({id});});
it('requires authentication before reads and writes',async()=>{
 m.session.mockResolvedValue(new Response(null,{status:401}));expect((await GET(new Request('http://localhost/?id='+id))).status).toBe(401);expect((await post()).status).toBe(401);expect(m.material).not.toHaveBeenCalled();expect(m.append).not.toHaveBeenCalled();
});
it('binds human reviewer to session and revalidates material before appending',async()=>{
 const response=await post();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
 expect(m.material).toHaveBeenCalledWith({userId:id},{bundleId:id,caseId:'replay'});expect(m.append).toHaveBeenCalledWith({userId:id,reviewerKind:'human'},body);
});
it('rejects identity injection and cross-origin writes',async()=>{
 for(const changed of [{...body,userId:id},{...body,reviewerKind:'human'},{...body,judgment:{...body.judgment,reviewerId:id}}])expect((await post(changed)).status).toBe(400);
 expect((await post(body,{origin:'http://other.invalid'})).status).toBe(403);expect(m.append).not.toHaveBeenCalled();
});
it('accepts the browser Host origin when the internal request URL uses a different host',async()=>{
 const request=new Request('http://localhost/api',{method:'POST',body:JSON.stringify(body),headers:{host:'127.0.0.1:3018',origin:'http://127.0.0.1:3018','sec-fetch-site':'same-origin'}});
 expect((await POST(request)).status).toBe(200);expect(m.append).toHaveBeenCalledOnce();
 expect((await post(body,{host:'127.0.0.1:3018',origin:'http://other.invalid','sec-fetch-site':'cross-site'})).status).toBe(403);
 expect((await post(body,{host:'127.0.0.1:3018',origin:'http://127.0.0.1:3018','sec-fetch-site':'same-site'})).status).toBe(403);
});
it('does not save stale material or disclose private errors',async()=>{
 m.material.mockResolvedValueOnce({artifactHash:'b'.repeat(64),observationHash:hash});expect((await post()).status).toBe(409);
 m.material.mockRejectedValueOnce(new Error('PRIVATE TEXT'));const response=await post();expect(response.status).toBe(409);expect(await response.text()).not.toContain('PRIVATE');expect(m.append).not.toHaveBeenCalled();
});
it('rejects a positive verdict for an incomplete safety arm',async()=>{
 m.material.mockResolvedValueOnce({artifactHash:hash,observationHash:hash,canPass:{baseline:true,candidate:false}});
 const changed={...body,judgment:{...body.judgment,candidate:{...verdict,answer:true}}};
 expect((await post(changed)).status).toBe(409);expect(m.append).not.toHaveBeenCalled();
});
it('permits revocation without rerunning unavailable material',async()=>{
 expect((await post({...body,judgment:{...body.judgment,revoked:true}})).status).toBe(200);expect(m.material).not.toHaveBeenCalled();expect(m.append).toHaveBeenCalledOnce();
});
it('validates and routes paginated summaries and selected cases',async()=>{
 expect((await GET(new Request('http://localhost/?skillId='+id+'&offset=12'))).status).toBe(200);expect(m.list).toHaveBeenCalledWith({userId:id},{skillId:id,offset:12});
 expect((await GET(new Request('http://localhost/?id='+id+'&caseId=replay'))).status).toBe(200);expect(m.material).toHaveBeenCalledWith({userId:id},{bundleId:id,caseId:'replay'});
 expect((await GET(new Request('http://localhost/?id='+id+'&owner=other'))).status).toBe(400);
 expect((await GET(new Request('http://localhost/?skillId='+id+'&offset=-1'))).status).toBe(400);
});
