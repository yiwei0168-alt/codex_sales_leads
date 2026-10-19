import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),query:vi.fn(),read:vi.fn(),realpath:vi.fn(),stat:vi.fn(),snapshot:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({requireApiSession:m.session}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:m.query,tenantTransaction:m.transaction}));
vi.mock('@/lib/knowledge/immutable-asset-snapshot',()=>({readAvailableImmutableKnowledgeAsset:m.snapshot}));
vi.mock('node:fs/promises',()=>({readFile:m.read,realpath:m.realpath,stat:m.stat}));
import {GET} from './route';
const assetId='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
const bytes=Buffer.from('original pdf bytes');
const asset={storageKey:'knowledge/product/source.pdf',mimeType:'application/pdf',byteSize:String(bytes.length),title:'Synthetic original',
 sourceSha256:createHash('sha256').update(bytes).digest('hex')};
const get=(range?:string,id=assetId)=>GET(new Request('http://local/api/knowledge/assets/'+id,{headers:range?{range}:{}}),{params:Promise.resolve({assetId:id})});
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({userId:owner});m.query.mockResolvedValue([structuredClone(asset)]);
 m.snapshot.mockResolvedValue(null);m.transaction.mockImplementation(async(_user:string,work:(client:unknown)=>Promise<unknown>)=>work({}));
 m.realpath.mockResolvedValue(resolve(asset.storageKey));m.stat.mockResolvedValue({isFile:()=>true,size:bytes.length});m.read.mockResolvedValue(bytes);});

it('returns the exact registered original after a final access check',async()=>{
 const response=await get();expect(response.status).toBe(200);expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
 expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(m.query).toHaveBeenCalledTimes(2);
 expect(m.query.mock.calls.every(call=>call[0]===owner&&call[2][0]===assetId&&call[2][1]===owner)).toBe(true);
 expect(m.query.mock.calls[0][1]).toContain("d.status='active'");
});
it('serves captured bytes without touching a missing or tampered filesystem original',async()=>{
 m.snapshot.mockResolvedValue({bytes});m.read.mockRejectedValue(new Error('file unavailable'));
 const response=await get();expect(response.status).toBe(200);expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
 expect(m.realpath).not.toHaveBeenCalled();expect(m.read).not.toHaveBeenCalled();
 expect(m.snapshot).toHaveBeenCalledWith({},owner,assetId,asset.sourceSha256);expect(m.query).toHaveBeenCalledTimes(2);
});
it('supports ranges from the same verified complete snapshot',async()=>{
 m.snapshot.mockResolvedValue({bytes});const response=await get('bytes=1-3');expect(response.status).toBe(206);
 expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(1,4));expect(m.read).not.toHaveBeenCalled();
});
it('does not fall back to a file when snapshot verification fails',async()=>{
 m.snapshot.mockRejectedValue(new Error('Immutable snapshot integrity mismatch'));
 expect((await get()).status).toBe(410);expect(m.read).not.toHaveBeenCalled();
});
it('rejects incorrectly sized snapshot bytes before returning a range',async()=>{
 m.snapshot.mockResolvedValue({bytes:Buffer.from('wrong')});expect((await get('bytes=1-3')).status).toBe(410);
});
it('withholds snapshot bytes when source access is withdrawn before the final check',async()=>{
 m.snapshot.mockImplementation(async()=>{m.query.mockResolvedValue([]);return {bytes};});
 const response=await get();expect(response.status).toBe(404);expect(await response.text()).not.toContain(bytes.toString());
});
it('preserves byte-range responses only for a verified full original',async()=>{
 const response=await get('bytes=1-3');expect(response.status).toBe(206);
 expect(response.headers.get('Content-Range')).toBe(`bytes 1-3/${bytes.length}`);
 expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(1,4));expect(m.query).toHaveBeenCalledTimes(2);
});
it('rejects same-size byte replacement before returning even a partial response',async()=>{
 m.read.mockResolvedValue(Buffer.from('x'.repeat(bytes.length)));
 const response=await get('bytes=1-3');expect(response.status).toBe(410);
 expect(response.headers.get('Content-Range')).toBeNull();expect(m.query).toHaveBeenCalledTimes(1);
 expect(await response.text()).not.toContain('xxxx');
});
it('rejects file growth between stat and read',async()=>{
 m.read.mockResolvedValue(Buffer.concat([bytes,Buffer.from('extra')]));
 expect((await get()).status).toBe(410);
});
it('returns no file when access is withdrawn during the read',async()=>{
 m.read.mockImplementation(async()=>{m.query.mockResolvedValue([]);return bytes;});
 const response=await get();expect(response.status).toBe(404);
 expect(await response.text()).not.toContain(bytes.toString());expect(m.query).toHaveBeenCalledTimes(2);
});
it.each(['storageKey','sourceSha256','byteSize','mimeType'] as const)('rejects changed registration %s after reading',async key=>{
 m.query.mockResolvedValueOnce([asset]).mockResolvedValueOnce([{...asset,[key]:'changed'}]);
 expect((await get()).status).toBe(410);
});
it('denies an already withdrawn or inaccessible document before filesystem reads',async()=>{
 m.query.mockResolvedValue([]);expect((await get()).status).toBe(404);expect(m.read).not.toHaveBeenCalled();
});
it('keeps invalid ranges rejected after integrity and authorization checks',async()=>{
 const response=await get('bytes=999-');expect(response.status).toBe(416);expect(m.query).toHaveBeenCalledTimes(2);
 expect(response.headers.get('Content-Range')).toBe(`bytes */${bytes.length}`);
});
it('rejects malformed IDs and anonymous requests without querying files',async()=>{
 expect((await get(undefined,'11111111-1111-4111-81111111111111111')).status).toBe(404);expect(m.query).not.toHaveBeenCalled();
 m.session.mockResolvedValue(Response.json({error:'Unauthorized'},{status:401}));
 expect((await get()).status).toBe(401);expect(m.read).not.toHaveBeenCalled();
});
