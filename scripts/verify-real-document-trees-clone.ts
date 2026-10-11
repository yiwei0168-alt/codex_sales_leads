/** Real local development artifacts through the tree writer and evidence ACLs. No publication. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {evidenceText,spreadsheetLocation,writeExtractedTree,type Block} from '../src/lib/knowledge/extracted-tree';
import {readEvidence} from '../src/lib/knowledge/vectorless';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
globalThis.fetch=async()=>{throw Error('No network in document clone verification');};
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID(),collection=randomUUID();
const docs:string[]=[],results:unknown[]=[];
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
try{
 await pool.query("insert into knowledge_collection(id,slug,name,base_type) values($1,$2,'Local development sources','industry')",[collection,`fixture-${collection}`]);
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Tree verification','!','member','active')",[id,`${id}@example.invalid`]);
 for(const [original,artifact] of [['itu-ict-2025.xlsx','xlsx-layout-v2.0.2.json'],['itu-handbook-2020.pdf','pdf-layout-v2.0.3.json'],['itu-satellite-2025.pptx','pptx-layout-v2.0.3.json']]){
  const root='tmp/ma24-public-eval-candidates/';
  const source=await readFile(root+original),bytes=await readFile(root+artifact);
  const parsed=JSON.parse(bytes.toString('utf8')) as {sourceSha256:string;extractorVersion:string;blocks:Block[]};
  assert.equal(parsed.sourceSha256,digest(source));
  const extension=original.split('.').at(-1)!;
  const mimeTypes:Record<string,string>={pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
  const doc=randomUUID(),asset=randomUUID();docs.push(doc);
  await pool.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
   values($1,$2,$1::uuid::text,'Local development document','manual',$3,$4,'private')`,[doc,collection,digest(source),owner]);
  await pool.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
   values($1,$2,$3,$4,$5,$6,$7,'local-development')`,[asset,doc,root+original,digest(source),mimeTypes[extension],source.length,extension.toUpperCase()]);
  const input={documentId:doc,assetId:asset,sourceSha256:digest(source),extractorVersion:parsed.extractorVersion,artifactHash:digest(bytes),blocks:parsed.blocks};
  const client=await pool.connect();
  let versionId:string;
  try{
   await client.query('begin');
   const tree=await writeExtractedTree(client,input);versionId=tree.versionId;
   assert.equal((await writeExtractedTree(client,input)).reused,true);
   await client.query('update knowledge_document set current_tree_version_id=$2 where id=$1',[doc,versionId]);
   await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  const stored=(await pool.query<{id:string;title:string;content:string;content_sha256:string;source_location:Record<string,unknown>}>(
   "select id,title,content,content_sha256,source_location from knowledge_tree_node where version_id=$1 and node_kind='evidence' order by ordinal",[versionId!])).rows;
  const expected=parsed.blocks.filter(b=>b.quality==='success'&&evidenceText(b));assert.equal(stored.length,expected.length);
  for(const [index,row] of stored.entries()){
   const b=expected[index];assert.equal(row.title,b.id);assert.equal(row.content,evidenceText(b));assert.equal(row.content_sha256,digest(row.content));
   assert.equal(row.source_location.unitIndex,b.unitIndex);assert.deepEqual(row.source_location.bbox,b.bbox??null);
   const location=spreadsheetLocation(b);
   if(location)for(const [key,value] of Object.entries(location))assert.equal(row.source_location[key],value);
  }
  for(const row of [stored[0],stored.at(-1)!]){
   const found=await readEvidence(owner,row.id);assert.equal(found?.content,row.content);assert.deepEqual(found?.source_location,row.source_location);
   assert.equal(await readEvidence(other,row.id),null);
  }
  await pool.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[asset]);
  assert.equal(await readEvidence(owner,stored[0].id),null);
  results.push({format:original.split('.').at(-1),sourceSha256:digest(source),extractorVersion:parsed.extractorVersion,evidenceBlocksCompared:stored.length,
   evidenceContentHashesMatch:true,locationsMatch:true,idempotence:true,crossAccountDenied:true,withdrawnSourceDenied:true});
 }
 console.log(JSON.stringify({cloneOnly:true,results,productionWrites:0,modelCalls:0,qualityAccepted:false,scope:'Tree persistence and evidence read, not upload worker lifecycle or semantic answer quality'}));
}finally{
 for(const doc of docs){
  await pool.query('update knowledge_document set current_tree_version_id=null where id=$1',[doc]);
  await pool.query('delete from knowledge_tree_node where version_id in(select id from knowledge_tree_version where document_id=$1)',[doc]);
  await pool.query('delete from knowledge_tree_version where document_id=$1',[doc]);
  await pool.query('delete from knowledge_asset where document_id=$1',[doc]);
  await pool.query('delete from knowledge_document where id=$1',[doc]);
 }
 await pool.query('delete from knowledge_collection where id=$1',[collection]);
 await pool.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);
 await pool.end();await getPool().end();
}
