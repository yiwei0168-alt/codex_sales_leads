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
const path='tmp/ma24-independent-quarantine/bpi-march-2018.xlsx';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
try{
  const original=await readFile(path);
  assert.equal(hash(original),'7d178716b667ebe66537154b0bb96f87348ccb782368b2f43920b45db9f7f5c1');
  for(const id of [owner,other])await pool.query(
    "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'BDUK XLSX clone','!','member','active')",
    [id,`${id}@example.invalid`]);
  const pointers=JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows);
  const job=await createKnowledgeUploadJob(owner,{collection:'industry',title:'BDUK 2018 isolated citation candidate',
    originalFilename:'bpi-march-2018.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes:original,visibility:'private',sourceUrl:'https://assets.publishing.service.gov.uk/media/5b053e8ee5274a2b17b217fd/Broadband_Performance_Indicator_March_2018_spreadsheet_version.xlsx'});
  await runBoundedLocalProcess(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx',
    'scripts/process-knowledge-upload-jobs.ts',`--job-id=${job.id}`,'--limit=1'],300000);
  const registered=(await pool.query<{status:string;published_document_id:string}>(
    'select status,published_document_id from knowledge_upload_job where id=$1',[job.id])).rows[0];
  assert.equal(registered.status,'registered');assert(registered.published_document_id);
  const evidence=(await pool.query<{id:string;source_location:Record<string,unknown>}>(`
    select n.id,n.source_location from knowledge_tree_node n join knowledge_document d on d.current_tree_version_id=n.version_id
    where d.id=$1 and n.title='sheet-1-table' and n.node_kind='evidence'`,[registered.published_document_id])).rows[0];
  assert(evidence);
  assert.equal(evidence.source_location.sheetName,'Sheet1');
  assert.equal(evidence.source_location.cellRange,'A1:E33');
  const found=await readEvidence(owner,evidence.id,['industry']);assert(found);
  for(const literal of ['A26: March 2018','B26: 4852808','C26: 611677118','D26: 7934',
    'A33:', '7,617 premises covered per £million'])assert(found.content.includes(literal),literal);
  assert.equal(await readEvidence(other,evidence.id,['industry']),null);
  assert.equal(JSON.stringify((await pool.query('select * from knowledge_release_pointer_v3 order by scope_kind,owner_id')).rows),pointers);
  console.log(JSON.stringify({cloneOnly:true,sourceSha256:hash(original),extractorVersion:'layout-v2.0.10',
    registered:true,cellRange:'A1:E33',targetCellsRead:6,crossAccountDenied:true,
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
