import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),preview:vi.fn(),capture:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:m.session}));
vi.mock('@/lib/assistant/main/skill-acceptance-originals',async original=>({...await original<typeof import('@/lib/assistant/main/skill-acceptance-originals')>(),previewSkillAcceptanceOriginals:m.preview,captureSkillAcceptanceOriginals:m.capture}));
import {GET,POST} from './route';
const id='11111111-1111-4111-8111-111111111111',body={bundleId:id,artifactHash:'a'.repeat(64),sourceManifestHash:'b'.repeat(64)};
const post=(data:unknown=body,headers:Record<string,string>={})=>POST(new Request('http://localhost/api/assistant/skills/acceptance-originals',{method:'POST',headers,body:JSON.stringify(data)}));
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({userId:id});m.preview.mockResolvedValue({assetCount:1,pendingCount:1,automaticActivation:false});m.capture.mockResolvedValue({assetCount:1,pendingCount:0,automaticActivation:false});});
it('requires authentication for previews and capture',async()=>{
 m.session.mockResolvedValue(new Response('',{status:401}));expect((await GET(new Request('http://localhost/?bundleId='+id))).status).toBe(401);expect((await post()).status).toBe(401);
 expect(m.preview).not.toHaveBeenCalled();expect(m.capture).not.toHaveBeenCalled();
});
it('takes the actor from the session and never accepts caller source IDs',async()=>{
 const result=await post();expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toContain('no-store');
 expect(m.capture).toHaveBeenCalledExactlyOnceWith({userId:id},body);
 m.capture.mockClear();expect((await post({...body,ownerId:'other',assetIds:[id]})).status).toBe(400);expect(m.capture).not.toHaveBeenCalled();
});
const foreignHeaders:Array<Record<string,string>>=[{origin:'https://other.invalid'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}];
it.each(foreignHeaders)('rejects foreign capture origin %j',async headers=>{
 expect((await post(body,headers)).status).toBe(403);expect(m.capture).not.toHaveBeenCalled();
});
it('rejects oversized input before capture',async()=>{expect((await post({...body,extra:'x'.repeat(4096)})).status).toBe(413);expect(m.capture).not.toHaveBeenCalled();});
it('does not expose filesystem or source data when capture fails',async()=>{
 m.capture.mockRejectedValue(new Error('PRIVATE file path and bytes'));const result=await post();expect(result.status).toBe(409);expect(await result.text()).not.toContain('PRIVATE');
});
it('previews a stored bundle only and rejects extra query selectors',async()=>{
 expect((await GET(new Request('http://localhost/?bundleId='+id))).status).toBe(200);expect(m.preview).toHaveBeenCalledExactlyOnceWith({userId:id},id);
 expect((await GET(new Request('http://localhost/?bundleId='+id+'&assetId='+id))).status).toBe(400);
});
