import {createHash} from 'node:crypto';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({tenant:vi.fn(),transaction:vi.fn(),query:vi.fn(),inspect:vi.fn(),read:vi.fn(),tree:vi.fn(),review:vi.fn(),commits:0,rollbacks:0}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:m.tenant,tenantTransaction:m.transaction}));
vi.mock('node:fs/promises',()=>({readFile:m.read}));
vi.mock('./document-repository',()=>({inspectKnowledgeAssetBytes:m.inspect,safeKnowledgeStorageKey:(v:string)=>v,assertResolvedInsideKnowledgeRoot:vi.fn()}));
vi.mock('./reviewed-extraction',()=>({verifyReviewedExtraction:vi.fn(),revalidateReviewedExtraction:m.review}));
vi.mock('./extracted-tree',()=>({writeExtractedTree:m.tree,evidenceText:(block:{text:string})=>block.text}));
import {indexExtractedDocument} from './vectorless';
const hash='a'.repeat(64),artifact=Buffer.from(JSON.stringify({documents:[{sourceSha256:hash,extractorVersion:'test',blocks:[{id:'unit-1',unitType:'document',unitIndex:1,quality:'success',text:'Synthetic evidence'}]}]}));
const artifactHash=createHash('sha256').update(artifact).digest('hex');
beforeEach(()=>{
 for(const value of Object.values(m))if(typeof value==='function')value.mockReset();m.commits=0;m.rollbacks=0;
 m.tenant.mockResolvedValueOnce([{role:'member'}]).mockResolvedValueOnce([{id:'job',status:'registered',visibility:'private',published_document_id:'document',published_asset_id:'asset',source_sha256:hash,extractor_version:'test',storage_key:'knowledge/original.txt',extraction_artifact_key:'knowledge/artifact.json',metrics:{artifactSha256:artifactHash}}]);
 m.read.mockResolvedValue(artifact);m.inspect.mockResolvedValue({sha256:hash,byteSize:10});
 m.tree.mockResolvedValue({versionId:'new-tree',reused:false,nodes:2});
 m.query.mockImplementation(async(sql:string)=>({rows:sql.includes('select a.id')?[{id:'asset',byte_size:'10'}]:sql.includes('select role from app_user')?[{role:'admin'}]:[]}));
 m.transaction.mockImplementation(async(_owner:string,work:(client:unknown)=>Promise<unknown>)=>{
  try{const value=await work({query:m.query});m.commits++;return value;}catch(error){m.rollbacks++;throw error;}
 });
});
it('commits only after original and artifact rechecks and binds the registered storage key',async()=>{
 expect(await indexExtractedDocument('owner','job')).toMatchObject({versionId:'new-tree'});
 expect(m.inspect.mock.calls).toEqual([['knowledge/original.txt',hash],['knowledge/original.txt',hash],['knowledge/artifact.json',artifactHash]]);
 expect(m.query.mock.calls.find(([sql])=>sql.includes('select a.id'))?.[1]).toEqual(['asset','document',hash,'owner','knowledge/original.txt']);
 expect(m.commits).toBe(1);expect(m.rollbacks).toBe(0);
});
it.each(['original','artifact'])('rejects a late %s hash mismatch after tree/pointer writes',async kind=>{
 m.inspect.mockResolvedValueOnce({sha256:hash,byteSize:10});
 if(kind==='artifact')m.inspect.mockResolvedValueOnce({sha256:hash,byteSize:10});
 m.inspect.mockRejectedValueOnce(new Error('Knowledge asset no longer matches approved hash'));
 await expect(indexExtractedDocument('owner','job')).rejects.toThrow('no longer matches approved hash');
 expect(m.tree).toHaveBeenCalledOnce();expect(m.query.mock.calls.some(([sql])=>sql.includes('update knowledge_document'))).toBe(true);
 expect(m.commits).toBe(0);expect(m.rollbacks).toBe(1);
});
it('rejects late size drift',async()=>{
 m.inspect.mockResolvedValueOnce({sha256:hash,byteSize:10}).mockResolvedValueOnce({sha256:hash,byteSize:11});
 await expect(indexExtractedDocument('owner','job')).rejects.toThrow('Source bytes changed during tree indexing');
 expect(m.commits).toBe(0);expect(m.rollbacks).toBe(1);
});
it('rejects registered size drift before writing the tree',async()=>{
 m.query.mockImplementation(async(sql:string)=>({rows:sql.includes('select a.id')?[{id:'asset',byte_size:'11'}]:[]}));
 await expect(indexExtractedDocument('owner','job')).rejects.toThrow('Registered source size changed');
 expect(m.tree).not.toHaveBeenCalled();expect(m.commits).toBe(0);
});

it('rejects a late review invalidation after tree writes',async()=>{
 m.review.mockRejectedValueOnce(new Error('Invalid extraction review receipt'));
 await expect(indexExtractedDocument('owner','job')).rejects.toThrow('Invalid extraction review receipt');
 expect(m.tree).toHaveBeenCalledOnce();expect(m.commits).toBe(0);expect(m.rollbacks).toBe(1);
});
it('rejects an account disabled during indexing after tree writes',async()=>{
 const query=m.query.getMockImplementation()!;
 m.query.mockImplementation((sql:string)=>sql.includes('select role from app_user')?Promise.resolve({rows:[]}):query(sql));
 await expect(indexExtractedDocument('owner','job')).rejects.toThrow('Publication account is no longer authorized');
 expect(m.tree).toHaveBeenCalledOnce();expect(m.commits).toBe(0);expect(m.rollbacks).toBe(1);
});
it('rejects lease expiry after tree writes',async()=>{
 const query=m.query.getMockImplementation()!;
 m.query.mockImplementation((sql:string)=>sql.includes('lease_until>clock_timestamp() for update')?Promise.resolve({rows:[{id:'job'}]}):query(sql));
 await expect(indexExtractedDocument('owner','job','token')).rejects.toThrow('expired after publication preparation');
 expect(m.tree).toHaveBeenCalledOnce();expect(m.commits).toBe(0);expect(m.rollbacks).toBe(1);
});
