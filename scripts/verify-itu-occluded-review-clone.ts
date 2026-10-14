import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir,rm,rmdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob} from '../src/lib/knowledge/upload';
import {completeExtractionReview,getExtractionReview,getExtractionReviewImage,recordExtractionReview} from '../src/lib/knowledge/extraction-review';
import {readEvidence} from '../src/lib/knowledge/vectorless';
import {runBoundedLocalProcess} from './lib/run-bounded-local-process';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID();
const root=resolve('knowledge/uploads',owner);
assert(root.startsWith(resolve('knowledge/uploads')+sep));
const source='tmp/ma24-independent-quarantine/itu-q1-2026-bhatia.pdf';
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const summaries=[
  'Title and presenter attribution. The light-trail illustration is decorative.',
  'Presenter compares regional mobile connections per person; the Ericsson data-traffic graphic is a forecast with its own cited source and date.',
  'Presenter describes meaningful connectivity and landmass coverage; the world map is illustrative, not a measured regional table.',
  'Six illustrated challenges are difficult terrain, low density, lack of electricity, literacy, income and return on investment.',
  'The slide shows 1,354 Mn total subscribers from 1,306 Mn wireless plus 48 Mn wireline. Its FWA card shows 18.8 Mn against components 13.2 Mn and 5.1 Mn, which sum to 18.3 Mn; the slide does not resolve the discrepancy.',
  'An illustrative timeline connects land lines, 1G through 5G, and a prospective 2030 6G vision.',
  'An illustration contrasts good, bad and absent terrestrial coverage across dense urban through maritime or sky settings.',
  'Satellite, terrestrial and airborne networks are illustrated as a proposed integrated 2030 design. The covered 2023 sentence is excluded.',
  'A diagram links a LEO satellite to a subscriber terminal, gateway earth station, gateway control center and Internet.',
  'The presenter maps 3G to IMT-2000, 4G to IMT-Advanced, 5G to IMT-2020 and prospective 6G to IMT-2030.',
  'The speaker depicts WRC-27 spectrum topics as future decisions, including IMT and NTN; no adopted outcome is asserted.',
  'Closing thank-you slide; the aerial photograph is decorative.',
];
const excluded=['page-5-block-3','page-8-block-4','page-11-block-3'];
const run=(script:string,id:string)=>runBoundedLocalProcess(process.execPath,
  ['--require','./scripts/patch-node-user.cjs','--import','tsx',script,`--job-id=${id}`,'--limit=1'],300000);

try{
  const original=await readFile(source);
  assert.equal(sha(original),'8bac4a67a32ef5b9d87b7855dc57de7f686b405a6d2ffab537782265a61f0615');
  for(const id of [owner,other])await pool.query(
    "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'ITU occlusion clone','!','member','active')",
    [id,`${id}@example.invalid`]);
  const beforePointers=JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
  const job=await createKnowledgeUploadJob(owner,{collection:'industry',title:'ITU occlusion development review',
    originalFilename:'itu-q1-2026-bhatia.pdf',mimeType:'application/pdf',bytes:original,visibility:'private'});
  await run('scripts/process-knowledge-upload-jobs.ts',job.id);
  const initial=await getExtractionReview(owner,job.id);
  assert.equal(initial.total,12);
  await run('scripts/process-upload-visual-queue.ts',job.id);
  const successful=await getExtractionReview(owner,job.id,0,'successful');
  assert(successful.total>60);
  const all:typeof successful.blocks=[];
  for(let offset=0;offset<successful.total;offset+=20)
    all.push(...(await getExtractionReview(owner,job.id,offset,'successful')).blocks);
  for(const id of excluded){
    const item=all.find(row=>row.block.id===id);assert(item);
    assert.equal(item.block.quality,'success');
    assert(item.candidate?.coordinateSpace==='pdf-page-render');
    assert(item.previewBlockId);
    const preview=await getExtractionReviewImage(owner,job.id,successful.artifactSha256,item.previewBlockId);
    assert.equal(preview.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    await assert.rejects(()=>recordExtractionReview(owner,{jobId:job.id,artifactSha256:successful.artifactSha256,
      blockId:id,expectedRevision:0,decision:'evidence',evidenceText:'fabricated replacement',note:'must reject'}),
    /成功抽取文字仅可/);
    await recordExtractionReview(owner,{jobId:job.id,artifactSha256:successful.artifactSha256,
      blockId:id,expectedRevision:0,decision:'decoration',evidenceText:'',
      note:'Original page render shows this text covered by a foreground shape; exclude from indexed evidence.'});
  }
  for(let page=1;page<=12;page++){
    const current=await getExtractionReview(owner,job.id);
    const item=current.blocks.find(row=>row.block.unitIndex===page);assert(item);
    await recordExtractionReview(owner,{jobId:job.id,artifactSha256:current.artifactSha256,
      blockId:item.block.id,expectedRevision:0,decision:'evidence',evidenceText:summaries[page-1],
      note:'Read against the rendered original page in the isolated development clone.'});
  }
  const reviewed=await getExtractionReview(owner,job.id);
  assert.equal(reviewed.pendingResolved,12);
  const receipt=await completeExtractionReview(owner,job.id,reviewed.artifactSha256,reviewed.decisionSha256);
  assert.equal(receipt.readyForRegistration,true);
  await run('scripts/process-knowledge-upload-jobs.ts',job.id);
  const registered=(await pool.query<{status:string;published_document_id:string}>(
    'select status,published_document_id from knowledge_upload_job where id=$1',[job.id])).rows[0];
  assert.equal(registered.status,'registered');assert(registered.published_document_id);
  const nodes=(await pool.query<{id:string;title:string;content:string}>(
    `select n.id,n.title,n.content from knowledge_tree_node n join knowledge_document d on d.current_tree_version_id=n.version_id
     where d.id=$1 and n.node_kind='evidence'`,[registered.published_document_id])).rows;
  for(const id of excluded)assert(!nodes.some(node=>node.title===id),`Excluded block indexed: ${id}`);
  assert(!nodes.some(node=>node.content.includes('By 2023, LTE and 5G will cover')));
  const fwa=nodes.find(node=>node.content.includes('18.8 Mn')&&node.content.includes('13.2 Mn'));
  assert(fwa);
  const evidence=await readEvidence(owner,fwa.id,['industry']);assert(evidence);
  assert.equal(evidence.source_location.unitIndex,5);
  assert.equal(await readEvidence(other,fwa.id,['industry']),null);
  assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),beforePointers);
  console.log(JSON.stringify({cloneOnly:true,sourceSha256:sha(original),pendingPagesReviewed:12,
    successBlocksExcluded:excluded,originalPreviewRead:true,hiddenTextIndexed:false,
    page5FwaEvidenceCited:true,otherAccountDenied:true,productionKnowledgeWrites:0,modelCalls:0,
    sourceEligibleForIndependentGold:false}));
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
}
