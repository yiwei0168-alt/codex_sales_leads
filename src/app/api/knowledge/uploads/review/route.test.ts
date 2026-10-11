import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),read:vi.fn(),write:vi.fn(),original:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:mocks.session}));
vi.mock('@/lib/knowledge/extraction-review',async importOriginal=>{
  const actual=await importOriginal<typeof import('@/lib/knowledge/extraction-review')>();
  return {...actual,getExtractionReview:mocks.read,recordExtractionReview:mocks.write,getExtractionReviewOriginal:mocks.original};
});
import {GET,POST} from './route';
import {ExtractionReviewConflict} from '@/lib/knowledge/extraction-review';
const jobId='12345678-1234-4234-8234-123456789abc';
const valid={jobId,artifactSha256:'a'.repeat(64),blockId:'slide-1-image',expectedRevision:0,decision:'evidence',evidenceText:'Visible source text',note:'Checked against original'};
const post=(body:unknown)=>new Request('http://localhost/api/knowledge/uploads/review',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({userId:'owner',role:'member'});mocks.read.mockResolvedValue({blocks:[]});mocks.write.mockResolvedValue({revision:1,indexingResumed:false});});
describe('extraction review endpoint',()=>{
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
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(mocks.read).toHaveBeenCalledWith('owner',jobId,20);
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
