import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import type {Client} from 'pg';

/** Only the owning fresh-container harness may supply this live connection.
 * No filesystem source is created or mounted in the Web container. */
export async function verifyMa24SnapshotDownload(options:{admin:Client;base:string;ownerCookie:string;peerCookie:string;ownerEmail:string;disposableContainerId:string}){
 assert(/^[a-f0-9]{64}$/.test(options.disposableContainerId));
 assert.equal(new URL(options.base).hostname,'127.0.0.1');assert(options.ownerEmail.endsWith('@example.invalid'));
 const {admin}=options,document=randomUUID(),asset=randomUUID();
 const bytes=Buffer.from('Synthetic database-only original 0123456789\n'),sha=createHash('sha256').update(bytes).digest('hex');
 const owner=(await admin.query('select id from app_user where email=$1',[options.ownerEmail])).rows[0]?.id;assert(owner);
 const collection=(await admin.query('select id from knowledge_collection order by id limit 1')).rows[0]?.id;assert(collection);
 const request=async(cookie:string,range?:string)=>{
  const response=await fetch(`${options.base}/api/knowledge/assets/${asset}`,{headers:{...(cookie?{cookie}:{}),...(range?{range}:{})},signal:AbortSignal.timeout(10000)});
  return {status:response.status,headers:response.headers,bytes:Buffer.from(await response.arrayBuffer())};
 };
 await admin.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
  values($1,$2,$1::uuid::text,'Synthetic snapshot HTTP','synthetic',$3,$4,'private')`,[document,collection,sha,owner]);
 try{
  await admin.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
   values($1,$2,$3,$4,'text/plain',$5,'text','synthetic')`,[asset,document,`knowledge/nonexistent-${asset}.txt`,sha,bytes.length]);
  assert.equal((await request(options.ownerCookie)).status,410,'Uncaptured missing source must fail');
  await admin.query('begin');
  try{
   await admin.query('set local role network_copilot_app');
   await admin.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[owner]);
   assert((await admin.query('select capture_immutable_asset_snapshot($1,$2,$3) id',[asset,sha,bytes])).rows[0].id);
   await admin.query('commit');
  }catch(error){await admin.query('rollback');throw error;}
  const full=await request(options.ownerCookie);assert.equal(full.status,200);assert(full.bytes.equals(bytes));
  assert.equal(full.headers.get('cache-control'),'private, no-store');assert.equal(full.headers.get('content-length'),String(bytes.length));
  for(const [range,start,end] of [['bytes=2-5',2,5],['bytes=-4',bytes.length-4,bytes.length-1],['bytes=3-',3,bytes.length-1]] as const){
   const part=await request(options.ownerCookie,range);assert.equal(part.status,206);assert(part.bytes.equals(bytes.subarray(start,end+1)));
   assert.equal(part.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);
  }
  assert.equal((await request(options.ownerCookie,'bytes=999-')).status,416);
  assert.equal((await request('')).status,401);assert.equal((await request(options.peerCookie)).status,404);
  await admin.query("update knowledge_document set visibility='shared' where id=$1",[document]);
  assert((await request(options.peerCookie)).bytes.equals(bytes));
  await admin.query("update knowledge_document set visibility='private' where id=$1",[document]);
  assert.equal((await request(options.peerCookie)).status,404);
  await admin.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[asset]);
  assert.equal((await request(options.ownerCookie)).status,404);
  await admin.query("update knowledge_asset set registration_status='registered' where id=$1",[asset]);
  await admin.query("update knowledge_document set status='archived' where id=$1",[document]);
  assert.equal((await request(options.ownerCookie)).status,404);
  await admin.query("update knowledge_document set status='active' where id=$1",[document]);
  const restored=await request(options.ownerCookie);assert.equal(restored.status,200);assert(restored.bytes.equals(bytes));
  return {actualCompiledHttp:true,actualSnapshotDatabase:true,noFilesystemOriginal:true,threeRangeForms:true,anonymousAndPeerDenied:true,
   sharedToPrivateDenied:true,withdrawnAndArchivedDenied:true,restoredAccessMatches:true,modelCalls:0};
 }finally{
  // Snapshot deliberately survives metadata removal and is removed with the
  // disposable database container, not by disabling the immutability trigger.
  await admin.query('delete from knowledge_document where id=$1 and owner_id=$2',[document,owner]);
  assert.equal((await request(options.ownerCookie)).status,404);
 }
}
