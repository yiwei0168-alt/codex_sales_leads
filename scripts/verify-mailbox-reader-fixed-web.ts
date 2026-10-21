import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {verifyMa24MailboxReaderClone} from './lib/verify-ma24-mailbox-reader-clone';
import {verifyMa24CompanyCorrespondenceClone} from './lib/verify-ma24-company-correspondence-clone';

assert.equal(process.env.MA24_DISPOSABLE_READER_UI,'1');
const database=process.env.MA24_READER_DATABASE_CONTAINER!;assert.match(database,/^[a-f0-9]{64}$/);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
assert.match(docker(['inspect','--format','{{.Name}}',database]),/^\/ma24-pilot-fresh-[a-f0-9]{12}$/);
const upstream=new URL(process.env.MA24_READER_WEB_BASE!);assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!);assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.pathname,'/network_copilot_local');
const cookie=process.env.MA24_READER_OWNER_COOKIE!,peer=process.env.MA24_READER_PEER_COOKIE!;assert(cookie&&peer&&cookie!==peer);
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
const proxy=createServer({key:docker(['exec',database,'cat','/tmp/ma24-server.key']),cert:docker(['exec',database,'cat','/tmp/ma24-server.crt'])},(incoming,outgoing)=>{
 const forward=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
 forward.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forward);
});
const watchdog=setTimeout(()=>{console.error('Mailbox reader fixed Web watchdog expired');process.exit(1);},240000);watchdog.unref();
try{
 const owner=(await admin.query('select id,email from app_user where email=$1',[process.env.MA24_READER_OWNER_EMAIL])).rows[0];assert(owner);assert.match(owner.email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 const reader=await verifyMa24MailboxReaderClone({admin,base,cookie,userId:owner.id,allowSelfSignedLoopback:true});
 const messages=(await admin.query("select m.id from mailbox_message m join mailbox_connection c on c.id=m.connection_id where m.user_id=$1 and c.email='ma24-reader@example.invalid' order by m.id",[owner.id])).rows;assert.equal(messages.length,2);
 const path='/api/mailbox/messages/'+messages[0].id;
 for(const [actor,status] of [[cookie,200],[peer,404],['',401]] as const){const response=await fetch(upstream.origin+path,{headers:{cookie:actor},signal:AbortSignal.timeout(15000)});assert.equal(response.status,status);}
 const companyCorrespondence=await verifyMa24CompanyCorrespondenceClone({admin,base,cookie,peerCookie:peer,userId:owner.id,allowSelfSignedLoopback:true});
 assert.equal((await admin.query('select count(*)::int n from agent_run where user_id=$1',[owner.id])).rows[0].n,0);
 const result={mailboxReaderFixedWeb:'passed',companyCorrespondence,actualChromeHttpsCompiledWeb:true,reader,ownerReadAndPeerAnonymousRefusal:true,syntheticEncryptedMessagesOnly:true,actualModelCalls:0,mailConnections:0,mailSends:0,realBusinessQualityAccepted:false,productionQualified:false};await writeFile('tmp/ma24-mailbox-reader-fixed-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();proxy.closeAllConnections();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));await admin.end();clearTimeout(timeout);}
