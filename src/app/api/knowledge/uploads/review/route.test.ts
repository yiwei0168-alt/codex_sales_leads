import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),read:vi.fn(),write:vi.fn(),original:vi.fn(),complete:vi.fn(),retry:vi.fn(),image:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:mocks.session}));
vi.mock('@/lib/knowledge/extraction-review',async importOriginal=>{
  const actual=await importOriginal<typeof import('@/lib/knowledge/extraction-review')>();
  return {...actual,getExtractionReview:mocks.read,recordExtractionReview:mocks.write,getExtractionReviewOriginal:mocks.original,completeExtractionReview:mocks.complete,retryExtractionVisuals:mocks.retry,getExtractionReviewImage:mocks.image};
});
import {GET,POST} from './route';
import {ExtractionReviewConflict} from '@/lib/knowledge/extraction-review';
const jobId='12345678-1234-4234-8234-123456789abc';
const valid={jobId,artifactSha256:'a'.repeat(64),blockId:'slide-1-image',expectedRevision:0,decision:'evidence',evidenceText:'Visible source text',note:'Checked against original'};
const post=(body:unknown)=>new Request('http://localhost/api/knowledge/uploads/review',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({userId:'owner',role:'member'});mocks.read.mockResolvedValue({blocks:[]});mocks.write.mockResolvedValue({revision:1,indexingResumed:false});});
describe('extraction review endpoint',()=>{
  it('offers a bounded successful-text review view under the authenticated owner',async()=>{
    const url=`http://localhost/api/knowledge/uploads/review?jobId=${jobId}&offset=20&view=successful`;
    expect((await GET(new Request(url))).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith('owner',jobId,20,'successful');
    expect((await GET(new Request(url.replace('successful','everything')))).status).toBe(400);
  });
  it('requires paired positive nested image selectors and uses authenticated owner',async()=>{
    const url=`http://localhost/api/knowledge/uploads/review?format=image&jobId=${jobId}&artifactSha256=${'a'.repeat(64)}&blockId=sheet-1`;
    for(const query of ['&objectIndex=2','&imageIndex=1','&objectIndex=0&imageIndex=1','&objectIndex=2&imageIndex=1.5'])expect((await GET(new Request(url+query))).status).toBe(400);
    expect(mocks.image).not.toHaveBeenCalled();mocks.image.mockResolvedValue(Buffer.from('png'));
    const response=await GET(new Request(url+'&objectIndex=2&imageIndex=1'));expect(response.status).toBe(200);
    expect(mocks.image).toHaveBeenCalledWith('owner',jobId,'a'.repeat(64),'sheet-1',2,1);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('queues visual retry only for the authenticated owner and displayed artifact',async()=>{
    mocks.retry.mockResolvedValue({queued:true});
    const input={action:'retry-visuals',jobId,artifactSha256:'a'.repeat(64)};
    const response=await POST(post(input));expect(response.status).toBe(200);
    expect(await response.json()).toEqual({queued:true});
    expect(mocks.retry).toHaveBeenCalledWith('owner',jobId,input.artifactSha256);
    for(const invalid of [{...input,userId:'another-owner'},{...input,artifactSha256:undefined}])expect((await POST(post(invalid))).status).toBe(400);
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    mocks.session.mockResolvedValue(new Response(null,{status:401}));
    expect((await POST(post(input))).status).toBe(401);expect(mocks.retry).toHaveBeenCalledTimes(1);
  });
  it('preserves retry conflicts and hides internal preparation failures',async()=>{
    const input={action:'retry-visuals',jobId,artifactSha256:'a'.repeat(64)};
    mocks.retry.mockRejectedValue(new ExtractionReviewConflict('候选正在处理'));
    expect((await POST(post(input))).status).toBe(409);
    mocks.retry.mockRejectedValue(new Error('private candidate directory'));
    const response=await POST(post(input));expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private candidate directory');
  });
  it('requires the displayed decision revision hash for completion',async()=>{
    mocks.complete.mockResolvedValue({readyForRegistration:true});
    const input={action:'complete',jobId,artifactSha256:'a'.repeat(64),decisionSha256:'b'.repeat(64)};
    expect((await POST(post(input))).status).toBe(200);expect(mocks.complete).toHaveBeenCalledWith('owner',jobId,input.artifactSha256,input.decisionSha256);
    expect((await POST(post({...input,decisionSha256:undefined}))).status).toBe(400);
    mocks.complete.mockRejectedValue(new ExtractionReviewConflict('审核记录已变化'));expect((await POST(post(input))).status).toBe(409);
  });
  it('downloads only the explicitly bound original as an attachment',async()=>{
    mocks.original.mockResolvedValue({bytes:Buffer.from('original bytes'),filename:'资料.pptx'});
    const response=await GET(new Request(`http://local/?jobId=${jobId}&format=original&artifactSha256=${'a'.repeat(64)}`));
    expect(response.status).toBe(200);expect(mocks.original).toHaveBeenCalledWith('owner',jobId,'a'.repeat(64));
    expect(response.headers.get('content-disposition')).toContain('attachment;');expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe('original bytes');
    expect((await GET(new Request(`http://local/?jobId=${jobId}&format=original`))).status).toBe(400);
  });
  it('requires authentication before reading or writing',async()=>{
    mocks.session.mockResolvedValue(new Response(null,{status:401}));
    expect((await GET(new Request(`http://local/?jobId=${jobId}`))).status).toBe(401);
    expect((await POST(post(valid))).status).toBe(401);expect(mocks.read).not.toHaveBeenCalled();expect(mocks.write).not.toHaveBeenCalled();
  });
  it('binds review to authenticated owner and returns no-store data',async()=>{
    const response=await GET(new Request(`http://local/?jobId=${jobId}&offset=20`));
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(mocks.read).toHaveBeenCalledWith('owner',jobId,20,'pending');
    expect((await POST(post(valid))).status).toBe(200);expect(mocks.write).toHaveBeenCalledWith('owner',valid);
  });
  it('rejects invented reviewer, empty evidence and decoration with evidence',async()=>{
    for(const body of [{...valid,reviewerId:'other'},{...valid,evidenceText:''},{...valid,decision:'decoration'}])expect((await POST(post(body))).status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('limits actual streamed bytes without trusting content length',async()=>{
    const response=await POST(post({...valid,note:'x'.repeat(129000)}));
    expect(response.status).toBe(413);expect(mocks.write).not.toHaveBeenCalled();
  });
  it('returns conflicts without swallowing them as success',async()=>{
    mocks.write.mockRejectedValue(new ExtractionReviewConflict('版本已变化'));expect((await POST(post(valid))).status).toBe(409);
  });
  it('does not expose internal storage errors',async()=>{
    mocks.read.mockRejectedValue(new Error('private disk path'));const response=await GET(new Request(`http://local/?jobId=${jobId}`));
    expect(response.status).toBe(503);expect(await response.text()).not.toContain('private disk path');
  });
});
