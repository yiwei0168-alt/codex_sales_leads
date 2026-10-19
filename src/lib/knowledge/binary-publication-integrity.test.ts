import {createHash} from 'node:crypto';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({tenant:vi.fn(),transaction:vi.fn(),query:vi.fn(),inspect:vi.fn(),read:vi.fn(),index:vi.fn(),tree:vi.fn(),committed:0,rolledBack:0}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:m.tenant,tenantTransaction:m.transaction}));
vi.mock('node:fs/promises',()=>({readFile:m.read}));
vi.mock('./document-repository',()=>({inspectKnowledgeAssetBytes:m.inspect,safeKnowledgeStorageKey:(v:string)=>v,assertResolvedInsideKnowledgeRoot:vi.fn()}));
vi.mock('./reviewed-extraction',()=>({verifyReviewedExtraction:vi.fn()}));
vi.mock('./vectorless',()=>({evidenceText:()=> 'Approved evidence',indexExtractedDocument:m.index}));
vi.mock('./extracted-tree',()=>({assertNoSpreadsheetCachedErrors:vi.fn(),writeExtractedTree:m.tree}));
import {registerVectorlessUpload} from './vectorless-registration';
const sourceHash='a'.repeat(64);
const artifact=Buffer.from(JSON.stringify({documents:[{sourceSha256:sourceHash,extractorVersion:'test-v1',blocks:[{id:'page-1',unitType:'page',unitIndex:1,blockType:'paragraph',quality:'success',text:'Approved evidence'}]}]}));
const job={id:'job',status:'extracted',visibility:'private',collection_slug:'industry',title:'Synthetic',source_url:null,entity_key:null,
 storage_key:'knowledge/source.pdf',extraction_artifact_key:'knowledge/artifact.json',source_sha256:sourceHash,extractor_version:'test-v1',mime_type:'application/pdf',byte_size:'10',
 metrics:{artifactSha256:createHash('sha256').update(artifact).digest('hex')},revision_target_document_id:null as string|null,revision_base_version_id:null as string|null,published_document_id:null,published_asset_id:null};
beforeEach(()=>{
 for(const value of Object.values(m))if(typeof value==='function')value.mockReset();
 m.committed=0;m.rolledBack=0;
 m.transaction.mockImplementation(async(_owner:string,work:(client:unknown)=>Promise<unknown>)=>{
  try{const result=await work({query:m.query});m.committed++;return result;}catch(error){m.rolledBack++;throw error;}
 });
 m.inspect.mockResolvedValue({storageKey:job.storage_key,sha256:sourceHash,byteSize:10});m.read.mockResolvedValue(artifact);
 m.index.mockResolvedValue({versionId:'tree-new'});m.tree.mockResolvedValue({versionId:'tree-new',reused:false});
});
function arrange(revision:boolean,changedBinding=false){
 const value={...job,revision_target_document_id:revision?'document':null,revision_base_version_id:revision?'tree-old':null};
 m.tenant.mockResolvedValueOnce([{role:'member'}]).mockResolvedValueOnce([value]);
 m.query.mockImplementation(async(sql:string)=>{
  if(sql.includes('from knowledge_upload_job'))return {rows:[changedBinding?{...value,storage_key:'knowledge/replaced.pdf'}:value]};
  if(sql.includes('select pg_advisory'))return {rows:[]};
  if(sql.includes('select d.id,d.current_tree_version_id'))return {rows:[{id:'document',current_tree_version_id:'tree-old',source_sha256:'old',asset_id:'old-asset'}]};
  if(sql.includes('select id,metadata'))return {rows:[]};
  if(sql.includes('insert into knowledge_document')&&!sql.includes('knowledge_document_revision'))return {rows:[{id:'document'}]};
  if(sql.includes('insert into knowledge_asset'))return {rows:[{id:'asset'}]};
  return {rows:[]};
 });
}
it.each([false,true])('rejects a late original hash change inside the owning publication transaction; revision=%s',async revision=>{
 arrange(revision);m.inspect.mockResolvedValueOnce({storageKey:job.storage_key,sha256:sourceHash,byteSize:10}).mockRejectedValueOnce(new Error('Knowledge asset no longer matches approved hash'));
 await expect(registerVectorlessUpload('owner','job',{language:'en',authorityLevel:3})).rejects.toThrow('no longer matches approved hash');
 expect(m.inspect).toHaveBeenLastCalledWith(job.storage_key,sourceHash);expect(m.committed).toBe(0);expect(m.rolledBack).toBe(1);
 expect(m.index).not.toHaveBeenCalled();
});
it.each([false,true])('rejects a late original size mismatch; revision=%s',async revision=>{
 arrange(revision);m.inspect.mockResolvedValueOnce({storageKey:job.storage_key,sha256:sourceHash,byteSize:10}).mockResolvedValueOnce({storageKey:job.storage_key,sha256:sourceHash,byteSize:11});
 await expect(registerVectorlessUpload('owner','job',{language:'en',authorityLevel:3})).rejects.toThrow('Source bytes changed during');
 expect(m.committed).toBe(0);expect(m.rolledBack).toBe(1);
});
it.each([false,true])('rejects a locked job whose storage binding changed before any publication write; revision=%s',async revision=>{
 arrange(revision,true);
 await expect(registerVectorlessUpload('owner','job',{language:'en',authorityLevel:3})).rejects.toThrow('changed during registration');
 expect(m.query.mock.calls.some(([sql])=>/insert into|update knowledge_/i.test(sql))).toBe(false);
 expect(m.committed).toBe(0);expect(m.rolledBack).toBe(1);
});
it.each([false,true])('rejects a late extraction artifact hash change; revision=%s',async revision=>{
 arrange(revision);m.inspect.mockResolvedValueOnce({sha256:sourceHash,byteSize:10}).mockResolvedValueOnce({sha256:sourceHash,byteSize:10}).mockRejectedValueOnce(new Error('Knowledge asset no longer matches approved hash'));
 await expect(registerVectorlessUpload('owner','job',{language:'en',authorityLevel:3})).rejects.toThrow('no longer matches approved hash');
 expect(m.inspect).toHaveBeenLastCalledWith(job.extraction_artifact_key,job.metrics.artifactSha256);
 expect(m.committed).toBe(0);expect(m.rolledBack).toBe(1);expect(m.index).not.toHaveBeenCalled();
});
it.each([false,true])('commits only after original and extraction-artifact hash rechecks; revision=%s',async revision=>{
 arrange(revision);
 expect(await registerVectorlessUpload('owner','job',{language:'en',authorityLevel:3})).toMatchObject({documentId:'document',assetId:'asset',treeStatus:'searchable'});
 expect(m.inspect).toHaveBeenCalledTimes(3);expect(m.inspect).toHaveBeenLastCalledWith(job.extraction_artifact_key,job.metrics.artifactSha256);
 expect(m.committed).toBe(1);expect(m.rolledBack).toBe(0);
});
