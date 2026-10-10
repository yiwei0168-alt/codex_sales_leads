import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {knowledgeOriginalsTool as tool} from '../src/lib/assistant/main/knowledge-originals-tool';
import {knowledgeCompareTool} from '../src/lib/assistant/main/knowledge-compare-tool';
import {getPool} from '../src/lib/rag/db';
const url=process.env.DATABASE_MIGRATION_URL!,app=new URL(process.env.DATABASE_URL!);
const target=new URL(url);
assert(['localhost','127.0.0.1'].includes(target.hostname)&&app.hostname===target.hostname&&app.pathname===target.pathname&&app.port===target.port);
globalThis.fetch=async()=>{throw Error('HTTP forbidden in synthetic acceptance');};
const db=new Pool({connectionString:url});
const owner=randomUUID(),other=randomUUID(),doc=randomUUID(),asset=randomUUID();
const title=`Synthetic restricted source ${randomUUID()}`;
const context=(userId:string)=>({userId,runId:'local-contract',leaseToken:'none',role:'member' as const});
let created=false;
try{
 await db.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'MA24 boundary fixture','member','disabled'),($3,$4,'MA24 boundary fixture','member','disabled')",
 [owner,`${owner}@fixture.invalid`,other,`${other}@fixture.invalid`]);created=true;
 await db.query("insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility) values($1::uuid,(select id from knowledge_collection where slug='product'),($1::uuid)::text,$2,'fixture',$3,$4,'private')",
 [doc,title,'a'.repeat(64),owner]);
 await db.query("insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature) values($1,$2,'fixture/no-file.pdf',$3,'application/pdf',0,'datasheet','fixture')",[asset,doc,'a'.repeat(64)]);
 const own=await tool.execute({query:'',assetId:asset},context(owner));
 assert.equal((own.data as {kind:string}).kind,'document-candidates');
 const denied=await tool.execute({query:'',assetId:asset},context(other));
 assert.equal((denied.data as {kind:string}).kind,'deny');assert(!JSON.stringify(denied).includes(title));
 const absent=await tool.execute({query:title},context(other));assert.equal((absent.data as {kind:string}).kind,'insufficient-evidence');
 const empty=await tool.execute({query:''},context(other));assert.equal((empty.data as {kind:string}).kind,'clarification');
 const missing=await tool.execute({query:'',assetId:randomUUID()},context(other));assert.deepEqual(missing,denied);
 const scoped=await knowledgeCompareTool.execute({entities:['Synthetic Alpha','Synthetic Beta'],attributes:['ports']},{...context(owner),knowledgeScope:['company']});
 assert.equal((scoped.data as {kind:string}).kind,'deny');
 await db.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[asset]);
 assert.equal(((await tool.execute({query:'',assetId:asset},context(owner))).data as {kind:string}).kind,'deny');
 assert.equal((await db.query('select count(*)::int n from paid_call_reservation where user_id=any($1::uuid[])',[[owner,other]])).rows[0].n,0);
 console.log(JSON.stringify({checks:7,crossAccountDenied:true,missingIdIndistinguishable:true,revocationDenied:true,scopeDenied:true,clarificationDistinct:true,externalCalls:0,paidCalls:0}));
}finally{
 if(created){await db.query('delete from knowledge_document where id=$1 and owner_id=$2',[doc,owner]);
 await db.query("delete from app_user where id=any($1::uuid[]) and display_name='MA24 boundary fixture'",[[owner,other]]);}
 await db.end();await getPool().end();
}
