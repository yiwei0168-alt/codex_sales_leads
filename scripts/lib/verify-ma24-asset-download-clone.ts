import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,unlink,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import type {Client} from 'pg';
import {hashPassword} from '../../src/lib/auth/password';

/** Real authenticated HTTP against the compiled candidate and restored clone.
 * All files/accounts/documents below are synthetic and owned by this fixture. */
export async function verifyMa24AssetDownloadClone(options:{admin:Client;base:string;cookie:string;userId:string}){
 assert.equal(new URL(options.base).hostname,'127.0.0.1');
 assert.match((await options.admin.query('select current_database() name')).rows[0].name,/^ma24_restore_[a-f0-9]{12}$/);
 const documentId=randomUUID(),assetId=randomUUID(),peer=randomUUID();
 const key=`knowledge/ma24-http-download-${randomUUID()}.txt`,path=resolve(key);
 assert(path.startsWith(resolve('knowledge')+sep));let written=false;
 const bytes=Buffer.from('MA24 synthetic original bytes: 0123456789\n','utf8');
 const sha=createHash('sha256').update(bytes).digest('hex');
 const request=async(cookie=options.cookie,range?:string,id:string=assetId)=>{
  const response=await fetch(`${options.base}/api/knowledge/assets/${id}`,{headers:{...(cookie?{cookie}:{}),...(range?{range}:{})},signal:AbortSignal.timeout(10000)});
  return {status:response.status,headers:response.headers,bytes:Buffer.from(await response.arrayBuffer())};
 };
 const status=async(expected:number,cookie=options.cookie,range?:string,id:string=assetId)=>assert.equal((await request(cookie,range,id)).status,expected);
 try{
  await mkdir(resolve('knowledge'),{recursive:true});await writeFile(path,bytes,{flag:'wx'});written=true;
  const collection=(await options.admin.query('select id from knowledge_collection order by id limit 1')).rows[0].id;
  await options.admin.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
   values($1,$2,$1::uuid::text,'MA24 synthetic download','synthetic',$3,$4,'private')`,[documentId,collection,sha,options.userId]);
  await options.admin.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
   values($1,$2,$3,$4,'text/plain',$5,'text','synthetic')`,[assetId,documentId,key,sha,bytes.length]);
  const email=`ma24-download-${peer}@example.invalid`,password=randomBytes(24).toString('base64url');
  await options.admin.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic download peer',$3,'member','active')",[peer,email,hashPassword(password)]);
  const login=await fetch(`${options.base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(10000)});
  assert.equal(login.status,200);const peerCookie=login.headers.get('set-cookie')?.split(';')[0];await login.body?.cancel();assert(peerCookie);
  await status(401,'');await status(404,peerCookie);await status(404,options.cookie,undefined,'not-a-uuid');await status(404,options.cookie,undefined,randomUUID());
  const full=await request();assert.equal(full.status,200);assert(full.bytes.equals(bytes));
  assert.equal(full.headers.get('content-length'),String(bytes.length));assert.equal(full.headers.get('content-type'),'text/plain');
  assert.equal(full.headers.get('cache-control'),'private, no-store');assert.equal(full.headers.get('x-content-type-options'),'nosniff');
  for(const [range,start,end] of [['bytes=2-6',2,6],['bytes=-4',bytes.length-4,bytes.length-1],['bytes=4-',4,bytes.length-1]] as const){
   const part=await request(options.cookie,range);assert.equal(part.status,206);assert(part.bytes.equals(bytes.subarray(start,end+1)));
   assert.equal(part.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);assert.equal(part.headers.get('content-length'),String(end-start+1));
  }
  for(const range of [`bytes=${bytes.length}-`,'bytes=0-1,3-4','bytes=-0']){
   const invalid=await request(options.cookie,range);assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),`bytes */${bytes.length}`);
  }
  try{await writeFile(path,Buffer.alloc(bytes.length,120));await status(410);}finally{await writeFile(path,bytes);}
  try{await writeFile(path,bytes.subarray(0,4));await status(410);}finally{await writeFile(path,bytes);}
  await unlink(path);written=false;await status(410);await writeFile(path,bytes,{flag:'wx'});written=true;
  await assert.rejects(options.admin.query("update knowledge_asset set storage_key='knowledge/../package.json' where id=$1",[assetId]),
   (error:unknown)=>(error as {code?:string}).code==='23514');
  const afterRejectedPath=await request();assert.equal(afterRejectedPath.status,200);assert(afterRejectedPath.bytes.equals(bytes));
  await options.admin.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[assetId]);await status(404);
  await options.admin.query("update knowledge_asset set registration_status='registered' where id=$1",[assetId]);
  await options.admin.query("update knowledge_document set status='archived' where id=$1",[documentId]);await status(404);
  await options.admin.query("update knowledge_document set status='active',visibility='shared',title='Current synthetic title' where id=$1",[documentId]);
  const shared=await request(peerCookie);assert.equal(shared.status,200);assert(shared.bytes.equals(bytes));
  assert(shared.headers.get('content-disposition')?.includes(encodeURIComponent('Current synthetic title.txt')));
  await options.admin.query("update knowledge_document set visibility='private' where id=$1",[documentId]);await status(404,peerCookie);
  const restored=await request();assert.equal(restored.status,200);assert(restored.bytes.equals(bytes));
  return {actualCompiledHttp:true,authenticatedSessions:2,completeDownloadMatches:true,threeRangeFormsVerified:true,
   invalidRangesRejected:true,anonymousAndPeerPrivateDenied:true,sameSizeTamperRejected:true,truncationRejected:true,
   missingOriginalRejected:true,storageTraversalRejectedByDatabase:true,withdrawnAssetRejected:true,archivedDocumentRejected:true,
   sharingThenWithdrawalVerified:true,currentDownloadTitleVerified:true,modelCalls:0,externalCalls:0,productionWrites:0};
 }finally{
  try{await options.admin.query('delete from knowledge_document where id=$1 and owner_id=$2',[documentId,options.userId]);
   await options.admin.query('delete from app_user where id=$1',[peer]);
   const residual=(await options.admin.query(`select (select count(*)::int from knowledge_document where id=$1) documents,
    (select count(*)::int from knowledge_asset where id=$2) assets,(select count(*)::int from app_user where id=$3) peers`,[documentId,assetId,peer])).rows[0];
   assert.deepEqual(residual,{documents:0,assets:0,peers:0});
  }finally{if(written)await unlink(path);}
 }
}
