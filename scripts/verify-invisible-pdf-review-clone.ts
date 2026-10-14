import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,rm,rmdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob} from '../src/lib/knowledge/upload';
import {completeExtractionReview,getExtractionReview,recordExtractionReview} from '../src/lib/knowledge/extraction-review';
import {readEvidence} from '../src/lib/knowledge/vectorless';
import {runBoundedLocalProcess} from './lib/run-bounded-local-process';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID();
const uploadsRoot=resolve('knowledge/uploads'),root=resolve(uploadsRoot,owner);
assert(root.startsWith(uploadsRoot+sep));
const tempRoot=resolve('tmp'),source=resolve(tempRoot,`ma24-invisible-pdf-${owner}.pdf`);
assert(source.startsWith(tempRoot+sep));
const run=(script:string,id:string)=>runBoundedLocalProcess(process.execPath,
  ['--require','./scripts/patch-node-user.cjs','--import','tsx',script,`--job-id=${id}`,'--limit=1'],300000);
try{
  await runBoundedLocalProcess(process.env.PYTHON_BINARY||'python',['-c',
    'import pymupdf,sys; d=pymupdf.open(); p=d.new_page(); p.insert_text((50,50),"Visible source evidence"); p.insert_text((50,80),"Invisible fabricated claim",fill_opacity=0); d.save(sys.argv[1]); d.close()',source],30000);
  for(const id of [owner,other])await pool.query(
    "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Invisible PDF clone','!','member','active')",
    [id,`${id}@example.invalid`]);
  const beforePointers=JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
  const job=await createKnowledgeUploadJob(owner,{collection:'industry',title:'Invisible PDF development probe',
    originalFilename:'invisible.pdf',mimeType:'application/pdf',bytes:await readFile(source),visibility:'private'});
  await run('scripts/process-knowledge-upload-jobs.ts',job.id);
  const held=(await pool.query<{status:string;error_code:string;published_document_id:string|null}>(
    'select status,error_code,published_document_id from knowledge_upload_job where id=$1',[job.id])).rows[0];
  assert.deepEqual(held,{status:'extracted',error_code:'extraction-review-required',published_document_id:null});
  const review=await getExtractionReview(owner,job.id);
  assert.equal(review.pendingTotal,1);
  assert.equal(review.blocks[0].block.metadata?.reviewReason,'invisible-pdf-text');
  const successful=await getExtractionReview(owner,job.id,0,'successful');
  const hidden=successful.blocks.find(row=>row.block.text?.includes('Invisible fabricated claim'));
  assert(hidden);
  await recordExtractionReview(owner,{jobId:job.id,artifactSha256:review.artifactSha256,
    blockId:hidden.block.id,expectedRevision:0,decision:'decoration',evidenceText:'',
    note:'Transparent text is absent from the rendered source page.'});
  await recordExtractionReview(owner,{jobId:job.id,artifactSha256:review.artifactSha256,
    blockId:review.blocks[0].block.id,expectedRevision:0,decision:'evidence',
    evidenceText:'The page visibly says Visible source evidence.',note:'Checked the rendered synthetic source page.'});
  const ready=await getExtractionReview(owner,job.id);
  assert.equal(ready.pendingResolved,1);
  await completeExtractionReview(owner,job.id,ready.artifactSha256,ready.decisionSha256);
  await run('scripts/process-knowledge-upload-jobs.ts',job.id);
  const registered=(await pool.query<{status:string;published_document_id:string}>(
    'select status,published_document_id from knowledge_upload_job where id=$1',[job.id])).rows[0];
  assert.equal(registered.status,'registered');assert(registered.published_document_id);
  const nodes=(await pool.query<{id:string;content:string}>(
    `select n.id,n.content from knowledge_tree_node n join knowledge_document d on d.current_tree_version_id=n.version_id
     where d.id=$1 and n.node_kind='evidence'`,[registered.published_document_id])).rows;
  assert(!nodes.some(node=>node.content.includes('Invisible fabricated claim')));
  const visible=nodes.find(node=>node.content.includes('Visible source evidence'));assert(visible);
  assert(await readEvidence(owner,visible.id,['industry']));
  assert.equal(await readEvidence(other,visible.id,['industry']),null);
  assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),beforePointers);
  console.log(JSON.stringify({cloneOnly:true,heldBeforeReview:true,successfulBlockExcluded:true,
    visibleEvidenceReadable:true,otherAccountDenied:true,productionKnowledgeWrites:0,modelCalls:0}));
}finally{
  await pool.query('delete from knowledge_upload_review_completion where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_upload_extraction_review where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_upload_job where user_id=$1',[owner]);
  await pool.query('update knowledge_document set current_tree_version_id=null where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_document where owner_id=$1',[owner]);
  await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);
  const residue=(await pool.query<{users:number;jobs:number;reviews:number;documents:number}>(`
    select (select count(*)::int from app_user where id=any($2::uuid[])) users,
      (select count(*)::int from knowledge_upload_job where user_id=$1) jobs,
      (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1) reviews,
      (select count(*)::int from knowledge_document where owner_id=$1) documents`,[owner,[owner,other]])).rows[0];
  assert.deepEqual(residue,{users:0,jobs:0,reviews:0,documents:0});
  await pool.end();await getPool().end();
  for(const name of await readdir(root).catch(()=>[])){
    const path=resolve(root,name);assert(path.startsWith(root+sep));await rm(path,{recursive:true,force:true});
  }
  await rmdir(root).catch(()=>undefined);
  await rm(source,{force:true});
}
