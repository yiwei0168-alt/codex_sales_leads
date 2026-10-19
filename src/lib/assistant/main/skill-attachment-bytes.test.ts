import {createHash,randomUUID} from 'node:crypto';
import {mkdir,unlink,writeFile,rename,readFile} from 'node:fs/promises';
import type {PoolClient} from 'pg';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {revalidateLockedSkillAttachmentBytes} from './skill-attachment-bytes';
import {revalidateLockedSkillKnowledgeReceiptBytes} from './skill-knowledge-receipt-bytes';

const interleave=vi.hoisted(()=>({afterDescriptorStat:undefined as undefined|(()=>Promise<void>),snapshot:vi.fn()}));
vi.mock('@/lib/knowledge/immutable-asset-snapshot',()=>({readAvailableImmutableKnowledgeAsset:interleave.snapshot}));
vi.mock('node:fs/promises',async importOriginal=>{
 const actual=await importOriginal<typeof import('node:fs/promises')>();
 return {...actual,open:async(...args:Parameters<typeof actual.open>)=>{
  const file=await actual.open(...args),hook=interleave.afterDescriptorStat;
  if(!hook)return file;
  let stats=0;
  return {read:file.read.bind(file),close:file.close.bind(file),stat:async()=>{
   const info=await file.stat();if(++stats===2)await hook();return info;
  }};
 }};
});

const owner=randomUUID(),run=randomUUID(),assetId=randomUUID();
const artifact={plan:{cases:[{id:'case',provenance:'safety-fixture'}]},rawReceipts:{safetySources:{case:{runId:run}}}};
const files:string[]=[];let key:string;
const query=vi.fn(),client={query} as unknown as PoolClient;
const bytes=Buffer.from('registered original');
const asset=()=>({id:assetId,storage_key:key,byte_size:String(bytes.length),source_sha256:createHash('sha256').update(bytes).digest('hex')});
beforeEach(async()=>{
 interleave.afterDescriptorStat=undefined;
 interleave.snapshot.mockReset();interleave.snapshot.mockResolvedValue(null);
 query.mockReset();await mkdir('knowledge',{recursive:true});key=`knowledge/ma24-byte-test-${randomUUID()}.txt`;
 await writeFile(key,bytes,{flag:'wx'});files.push(key);
 query.mockResolvedValueOnce({rows:[{input:{attachments:[{assetId}]}}]}).mockResolvedValueOnce({rows:[asset()]});
});
afterEach(async()=>{for(const file of files.splice(0))await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});});
it('hashes real bytes selected from stored task attachments and exposes only count and manifest hash',async()=>{
 const out=await revalidateLockedSkillAttachmentBytes(client,owner,artifact);
 expect(out).toMatchObject({attachmentBytesRevalidated:true,attachmentBytesCount:1});
 expect(out.attachmentBytesManifestHash).toMatch(/^[0-9a-f]{64}$/);
 expect(JSON.stringify(out)).not.toContain(key);expect(JSON.stringify(out)).not.toContain(assetId);
 expect(query.mock.calls[0][1]).toEqual([owner,[run]]);
 expect(query.mock.calls[1][1]).toEqual([[assetId],owner]);
 expect(query.mock.calls[1][0]).toContain("d.status='active'");
});
it('binds matching immutable snapshot IDs without exposing bytes',async()=>{
 const snapshotId=randomUUID();interleave.snapshot.mockResolvedValue({snapshotId,sourceSha256:asset().source_sha256,byteSize:bytes.length,bytes});
 const out=await revalidateLockedSkillAttachmentBytes(client,owner,artifact);
 expect(out.attachmentImmutableSnapshotCount).toBe(1);
 expect(out.attachmentImmutableSnapshotManifestHash).toMatch(/^[a-f0-9]{64}$/);
 expect(JSON.stringify(out)).not.toContain(snapshotId);expect(JSON.stringify(out)).not.toContain(bytes.toString());
});
it('reports zero immutable coverage when no captured snapshot is available',async()=>{
 expect((await revalidateLockedSkillAttachmentBytes(client,owner,artifact)).attachmentImmutableSnapshotCount).toBe(0);
});
it('propagates snapshot integrity or database failures instead of accepting filesystem-only evidence',async()=>{
 interleave.snapshot.mockRejectedValue(new Error('Immutable snapshot integrity mismatch'));
 await expect(revalidateLockedSkillAttachmentBytes(client,owner,artifact)).rejects.toThrow('snapshot integrity mismatch');
});
it('rejects real same-size tampering',async()=>{
 await writeFile(key,Buffer.alloc(bytes.length,120));
 await expect(revalidateLockedSkillAttachmentBytes(client,owner,artifact)).rejects.toThrow('bytes changed');
});
it.each(['attachment','knowledge-originals'])('rejects same-path file replacement during %s verification',async kind=>{
 const backup=`${key}.old`;files.push(backup);let replaced=false;
 interleave.afterDescriptorStat=async()=>{
  await rename(key,backup);await writeFile(key,Buffer.alloc(bytes.length,120),{flag:'wx'});replaced=true;
 };
 const check=kind==='attachment'?revalidateLockedSkillAttachmentBytes(client,owner,artifact):(()=>{
  query.mockReset();query.mockResolvedValueOnce({rows:[asset()]});
  return revalidateLockedSkillKnowledgeReceiptBytes(client,owner,[{tool:'knowledge_originals',output:{status:'success',data:{documents:[{id:assetId}]}}}]);
 })();
 await expect(check).rejects.toThrow('bytes changed');
 expect(replaced).toBe(true);
 expect(await readFile(key)).toEqual(Buffer.alloc(bytes.length,120));
 expect(await readFile(backup)).toEqual(bytes);
});
it('rejects truncated originals',async()=>{
 await writeFile(key,'short');await expect(revalidateLockedSkillAttachmentBytes(client,owner,artifact)).rejects.toThrow('bytes changed');
});
it('rejects missing originals',async()=>{
 await unlink(key);await expect(revalidateLockedSkillAttachmentBytes(client,owner,artifact)).rejects.toThrow();
});
it('rejects path escape before reading any bytes',async()=>{
 query.mockReset();query.mockResolvedValueOnce({rows:[{input:{attachments:[{assetId}]}}]})
  .mockResolvedValueOnce({rows:[{...asset(),storage_key:'knowledge/../package.json'}]});
 await expect(revalidateLockedSkillAttachmentBytes(client,owner,artifact)).rejects.toThrow('Invalid knowledge asset');
});
it('rejects withdrawn or inaccessible registrations',async()=>{
 query.mockReset();query.mockResolvedValueOnce({rows:[{input:{attachments:[{assetId}]}}]}).mockResolvedValueOnce({rows:[]});
 await expect(revalidateLockedSkillAttachmentBytes(client,owner,artifact)).rejects.toThrow('attachment unavailable');
});
it('rejects missing stored source tasks',async()=>{
 query.mockReset();query.mockResolvedValueOnce({rows:[]});
 await expect(revalidateLockedSkillAttachmentBytes(client,owner,artifact)).rejects.toThrow('task unavailable');
 expect(query).toHaveBeenCalledTimes(1);
});
it('does not fabricate a file requirement for tasks without attachments',async()=>{
 query.mockReset();query.mockResolvedValueOnce({rows:[{input:{attachments:[]}}]});
 expect(await revalidateLockedSkillAttachmentBytes(client,owner,artifact)).toMatchObject({attachmentBytesRevalidated:true,attachmentBytesCount:0});
 expect(query).toHaveBeenCalledTimes(1);
});
it('accepts and hashes an actual empty file',async()=>{
 await writeFile(key,'');query.mockReset();query.mockResolvedValueOnce({rows:[{input:{attachments:[{assetId}]}}]})
  .mockResolvedValueOnce({rows:[{...asset(),byte_size:'0',source_sha256:createHash('sha256').update('').digest('hex')}]});
 expect(await revalidateLockedSkillAttachmentBytes(client,owner,artifact)).toMatchObject({attachmentBytesCount:1});
});
