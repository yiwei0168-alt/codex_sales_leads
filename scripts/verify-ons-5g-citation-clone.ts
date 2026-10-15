/** Read-only quality candidate through an isolated upload and evidence chain. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir,rm,rmdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {createKnowledgeUploadJob} from '../src/lib/knowledge/upload';
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
const path='tmp/ma24-independent-quarantine/ons-5g-coverage-2026.xlsx';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
try{
  const original=await readFile(path);
  assert.equal(hash(original),'b488e723e475ce022fdf3d35bc1ead4611e58dda9cbf96371a6e7485834a6238');
  for(const id of [owner,other])await pool.query(
    "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'ONS 5G clone','!','member','active')",
    [id,`${id}@example.invalid`]);
  const pointers=JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
  const job=await createKnowledgeUploadJob(owner,{collection:'industry',title:'ONS 5G isolated citation candidate',
    originalFilename:'ons-5g-coverage-2026.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes:original,visibility:'private',sourceUrl:'https://www.ons.gov.uk/explore-local-statistics/api/v1/data/5g-coverage.xlsx?time=all'});
  await runBoundedLocalProcess(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx',
    'scripts/process-knowledge-upload-jobs.ts',`--job-id=${job.id}`,'--limit=1'],300000);
  const registered=(await pool.query<{status:string;published_document_id:string}>(
    'select status,published_document_id from knowledge_upload_job where id=$1',[job.id])).rows[0];
  assert.equal(registered.status,'registered');assert(registered.published_document_id);
  const evidence=(await pool.query<{id:string;source_location:Record<string,unknown>}>(`
    select n.id,n.source_location from knowledge_tree_node n join knowledge_document d on d.current_tree_version_id=n.version_id
    where d.id=$1 and n.title='sheet-4-table' and n.node_kind='evidence'`,[registered.published_document_id])).rows[0];
  assert(evidence);
  assert.equal(evidence.source_location.sheetName,'1');
  assert.equal(evidence.source_location.cellRange,'A1:C418');
  const found=await readEvidence(owner,evidence.id,['industry']);assert(found);
  for(const literal of ['B370: Highland','C370: 35.2','B381: Aberdeen City','C381: 99.85',
    'B382: Aberdeenshire','C382: 64.2','B395: Scotland','C395: 47.52'])assert(found.content.includes(literal),literal);
  const notes=(await pool.query<{id:string;source_location:Record<string,unknown>}>(`
    select n.id,n.source_location from knowledge_tree_node n join knowledge_document d on d.current_tree_version_id=n.version_id
    where d.id=$1 and n.title='sheet-3-table' and n.node_kind='evidence'`,[registered.published_document_id])).rows[0];
  assert(notes);
  assert.equal(notes.source_location.sheetName,'Notes');
  const definition=await readEvidence(owner,notes.id,['industry']);assert(definition);
  assert(definition.content.includes('B4: This indicator shows the percentage of geographic areas with 5G signal outdoors'));
  assert(definition.content.includes('signal strength threshold is -110dBm'));
  assert.equal(await readEvidence(other,evidence.id,['industry']),null);
  assert.equal(await readEvidence(other,notes.id,['industry']),null);
  assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),pointers);
  console.log(JSON.stringify({cloneOnly:true,sourceSha256:hash(original),extractorVersion:'layout-v2.0.10',
    registered:true,cellRange:'A1:C418',targetCellsRead:8,notesDefinitionRead:true,crossAccountDenied:true,
    productionKnowledgeWrites:0,modelCalls:0,independentGoldCreated:0}));
}finally{
  await pool.query('delete from knowledge_upload_job where user_id=$1',[owner]);
  await pool.query('update knowledge_document set current_tree_version_id=null where owner_id=$1',[owner]);
  await pool.query('delete from knowledge_document where owner_id=$1',[owner]);
  await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);
  const residue=(await pool.query<{users:number;jobs:number;documents:number}>(`
    select (select count(*)::int from app_user where id=any($2::uuid[])) users,
      (select count(*)::int from knowledge_upload_job where user_id=$1) jobs,
      (select count(*)::int from knowledge_document where owner_id=$1) documents`,[owner,[owner,other]])).rows[0];
  assert.deepEqual(residue,{users:0,jobs:0,documents:0});
  await pool.end();await getPool().end();
  for(const name of await readdir(root).catch(()=>[])){
    const file=resolve(root,name);assert(file.startsWith(root+sep));await rm(file,{recursive:true,force:true});
  }
  await rmdir(root).catch(()=>undefined);
}
