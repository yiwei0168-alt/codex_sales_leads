import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,readdir,rm,rmdir} from 'node:fs/promises';
import {basename,resolve,sep} from 'node:path';
import nextEnv from '@next/env';
import {Pool,type QueryResult} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob} from '../src/lib/knowledge/upload';
import {completeExtractionReview,getExtractionReview,recordExtractionReview} from '../src/lib/knowledge/extraction-review';
import {registerVectorlessUpload} from '../src/lib/knowledge/vectorless-registration';
import {readEvidence,searchDocuments} from '../src/lib/knowledge/vectorless';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(configured&&['localhost','127.0.0.1','::1'].includes(new URL(configured).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string;sourceDatabase:string;cleaned?:boolean};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database)&&!state.cleaned);
const url=new URL(configured);
assert.equal(decodeURIComponent(url.pathname.slice(1)),state.sourceDatabase);
url.pathname=`/${state.database}`;
process.env.DATABASE_URL=url.toString();

const sha256=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
const sourcePath='tmp/ma24-independent-quarantine/ieee-auto-sd4addr-2025.pptx';
const packagePath='tmp/ma24-independent-quarantine/ieee-auto-sd4addr-visual-candidates/review.json';
const [source,packageBytes,initialBytes,mapBytes]=await Promise.all([
  readFile(sourcePath),readFile(packagePath),
  readFile('docs/evidence/ma24-g14-ieee-auto-sd4addr-object-review-2026-10-14.json'),
  readFile('docs/evidence/ma24-g14-ieee-auto-sd4addr-map-limited-review-2026-10-15.json'),
]);
type Proposed={blockId:string;proposedDecision:'evidence'|'decoration'|'unresolved';evidenceText?:string;reason:string};
const candidate=JSON.parse(packageBytes.toString('utf8')) as {sourceSha256:string;records:Array<{blockId:string}>};
const initial=JSON.parse(initialBytes.toString('utf8')) as {sourceSha256:string;candidatePackageSha256:string;objects:Proposed[]};
const map=JSON.parse(mapBytes.toString('utf8')) as {sourceSha256:string;object:Proposed;proposedReviewAfterReplacement:{total:number;evidence:number;decoration:number;unresolved:number}};
assert.equal(sha256(source),candidate.sourceSha256);
assert.equal(initial.sourceSha256,candidate.sourceSha256);
assert.equal(initial.candidatePackageSha256,sha256(packageBytes));
assert.equal(map.sourceSha256,candidate.sourceSha256);
const proposals=new Map(initial.objects.map(row=>[row.blockId,row]));
assert.equal(proposals.size,11);
assert.equal(proposals.get(map.object.blockId)?.proposedDecision,'unresolved');
proposals.set(map.object.blockId,map.object);
assert.deepEqual(new Set(proposals.keys()),new Set(candidate.records.map(row=>row.blockId)));
assert.equal([...proposals.values()].filter(row=>row.proposedDecision==='evidence').length,9);
assert.equal([...proposals.values()].filter(row=>row.proposedDecision==='decoration').length,2);
assert.equal([...proposals.values()].filter(row=>row.proposedDecision==='unresolved').length,0);
assert.deepEqual(map.proposedReviewAfterReplacement,{total:11,evidence:9,decoration:2,unresolved:0});

const pool=new Pool({connectionString:url.toString()});
const owner=randomUUID(),other=randomUUID();
const uploadRoot=resolve('knowledge','uploads');
const ownerRoot=resolve(uploadRoot,owner);
assert(ownerRoot.startsWith(uploadRoot+sep)&&basename(ownerRoot)===owner);
let jobId:string|null=null;
async function runWorker(id:string){
  return new Promise<{awaitingReview:number;failed:number}>((done,reject)=>{
    const child=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx',
      'scripts/process-knowledge-upload-jobs.ts',`--job-id=${id}`,'--limit=1'],
      {cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:url.toString()}});
    let output='',error='';
    const timer=setTimeout(()=>child.kill(),240_000);
    child.stdout.on('data',part=>{output+=String(part);});
    child.stderr.on('data',part=>{error=(error+String(part)).slice(-2000);});
    child.once('error',cause=>{clearTimeout(timer);reject(cause);});
    child.once('exit',code=>{
      clearTimeout(timer);
      if(code!==0)return reject(new Error(error||`worker-exit-${code}`));
      try{done(JSON.parse(output));}catch{reject(new Error(`worker-invalid-json:${output.slice(-300)}`));}
    });
  });
}

try{
  const current=await pool.query<{db:string;review_table:string|null}>(
    "select current_database() db,to_regclass('public.knowledge_upload_extraction_review')::text review_table");
  assert.equal(current.rows[0]?.db,state.database);
  assert(current.rows[0]?.review_table);
  for(const [id,label] of [[owner,'SD4ADDR owner'],[other,'SD4ADDR other']] as const){
    await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,$3,'!','admin','active')",
      [id,`${id}@example.invalid`,label]);
  }
  const job=await createKnowledgeUploadJob(owner,{collection:'industry',title:'IEEE SD4ADDR isolated review',
    originalFilename:'ieee-auto-sd4addr-2025.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    bytes:source,visibility:'private'});
  jobId=job.id;
  const worker=await runWorker(job.id);
  assert.equal(worker.awaitingReview,1);
  assert.equal(worker.failed,0);
  const first=await getExtractionReview(owner,job.id);
  assert.equal(first.sourceSha256,candidate.sourceSha256);
  const stored=await pool.query<{extraction_artifact_key:string}>(
    'select extraction_artifact_key from knowledge_upload_job where id=$1 and user_id=$2',[job.id,owner]);
  const livePath=resolve(stored.rows[0].extraction_artifact_key);
  assert(livePath.startsWith(ownerRoot+sep));
  const [offlineBytes,liveBytes]=await Promise.all([
    readFile('tmp/ma24-independent-quarantine/ieee-auto-sd4addr-product-extraction.json'),readFile(livePath)]);
  const offline=JSON.parse(offlineBytes.toString('utf8')) as {documents:Array<{blocks:Array<{extractorVersion:string}>}>};
  const live=JSON.parse(liveBytes.toString('utf8')) as {documents:Array<{blocks:Array<{extractorVersion:string}>}>};
  assert.equal(live.documents.length,1);
  assert.equal(live.documents[0].blocks.length,68);
  const withoutVersion=(blocks:Array<{extractorVersion:string}>)=>blocks.map(block=>
    Object.fromEntries(Object.entries(block).filter(([key])=>key!=='extractorVersion')));
  assert.deepEqual(withoutVersion(live.documents[0].blocks),withoutVersion(offline.documents[0].blocks),
    'Current worker changed the reviewed block content or locators');
  assert.equal(first.total,11,'Current extraction changed the pending review set');
  const ids:string[]=[];
  for(let offset=0;offset<first.total;offset+=20){
    const page=await getExtractionReview(owner,job.id,offset);
    ids.push(...page.blocks.map(item=>item.block.id));
  }
  assert.equal(ids.length,11);
  assert.deepEqual(new Set(ids),new Set(proposals.keys()),'Current extraction changed the source-bound block IDs');
  for(const id of ids){
    const proposed=proposals.get(id)!;
    await recordExtractionReview(owner,{jobId:job.id,artifactSha256:first.artifactSha256,
      blockId:id,expectedRevision:0,decision:proposed.proposedDecision,
      evidenceText:proposed.proposedDecision==='evidence'?proposed.evidenceText:'',note:proposed.reason});
  }
  const reviewed=await getExtractionReview(owner,job.id);
  assert.equal(reviewed.resolved,11);
  for(const item of reviewed.blocks){
    const proposed=proposals.get(item.block.id)!;
    assert.equal(item.judgment?.decision,proposed.proposedDecision);
    assert.equal(item.judgment?.evidence_text??'',proposed.proposedDecision==='evidence'?proposed.evidenceText:'');
    assert.equal(item.judgment?.revision,1);
  }
  const receipt=await completeExtractionReview(owner,job.id,reviewed.artifactSha256,reviewed.decisionSha256);
  assert.equal(receipt.readyForRegistration,true);
  const registered=await registerVectorlessUpload(owner,job.id,{language:'en',authorityLevel:2,expectedSourceSha256:sha256(source)});
  assert.equal(registered.treeStatus,'searchable');
  const targets=[
    {blockId:'slide-6-text-2',slide:6,phrase:'etherType 0x08AF'},
    {blockId:'slide-7-visual-3',slide:7,phrase:'normal 4.639'},
    {blockId:'slide-9-visual-6',slide:9,phrase:'no legend mapping those symbols'},
  ];
  const checked=[];
  for(const target of targets){
    const row:QueryResult<{id:string}>=await pool.query<{id:string}>("select id from knowledge_tree_node where version_id=$1 and node_kind='evidence' and source_location->>'blockId'=$2",
      [registered.versionId,target.blockId]);
    assert.equal(row.rowCount,1);
    const evidence=await readEvidence(owner,row.rows[0].id,['industry']);
    assert(evidence);
    assert.equal(evidence.source_sha256,candidate.sourceSha256);
    assert.equal(evidence.source_location.unitIndex,target.slide);
    assert.equal(evidence.source_location.blockId,target.blockId);
    assert(evidence.content.includes(target.phrase));
    assert.equal(await readEvidence(other,row.rows[0].id,['industry']),null);
    checked.push(target.blockId);
  }
  const hits=await searchDocuments(owner,'SD4ADDR etherType 0x08AF',{collections:['industry']});
  assert(hits.some(item=>item.documentId===registered.documentId));
  const counts=await pool.query<{reviews:number;completions:number;documents:number}>(`
    select (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1 and job_id=$2) reviews,
      (select count(*)::int from knowledge_upload_review_completion where owner_id=$1 and job_id=$2) completions,
      (select count(*)::int from knowledge_document where owner_id=$1) documents`,[owner,job.id]);
  assert.deepEqual(counts.rows[0],{reviews:11,completions:1,documents:1});
  console.log(JSON.stringify({cloneOnly:true,sourceSha256:candidate.sourceSha256,artifactSha256:first.artifactSha256,
    extractionBlocks:68,blockContentAndLocatorsMatchReviewedSource:true,
    reviewSavedAndReadBack:11,decisions:{evidence:9,decoration:2},completionReceipt:true,
    treeStatus:registered.treeStatus,syntheticPublishedDocuments:1,citedBlockIds:checked,
    exactPhrasesChecked:checked.length,searchFound:true,otherAccountDenied:true,
    productionWrites:0,goldCreated:0,answerQualityAccepted:false}));
}finally{
  if(jobId){
    await pool.query('delete from knowledge_upload_review_completion where owner_id=$1',[owner]);
    await pool.query('delete from knowledge_upload_extraction_review where owner_id=$1',[owner]);
    await pool.query('delete from knowledge_upload_job where user_id=$1',[owner]);
  }
  await pool.query('update knowledge_document set current_tree_version_id=null where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_document where owner_id=$1',[owner]);
  await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);
  const residue=await pool.query<{users:number;jobs:number;reviews:number;completions:number;documents:number}>(`
    select (select count(*)::int from app_user where id=any($2::uuid[])) users,
      (select count(*)::int from knowledge_upload_job where user_id=$1) jobs,
      (select count(*)::int from knowledge_upload_extraction_review where owner_id=$1) reviews,
      (select count(*)::int from knowledge_upload_review_completion where owner_id=$1) completions,
      (select count(*)::int from knowledge_document where owner_id=$1) documents`,[owner,[owner,other]]);
  assert.deepEqual(residue.rows[0],{users:0,jobs:0,reviews:0,completions:0,documents:0});
  await pool.end();
  await getPool().end();
  for(const name of await readdir(ownerRoot).catch(()=>[])){
    const file=resolve(ownerRoot,name);
    assert(file.startsWith(ownerRoot+sep),'Refusing cleanup outside synthetic upload root');
    await rm(file,{force:true,recursive:true});
  }
  await rmdir(ownerRoot).catch(()=>undefined);
}
