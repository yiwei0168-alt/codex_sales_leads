import assert from 'node:assert/strict';
import net from 'node:net';

/** Disposable loopback PostgreSQL v3 fault injector. Never logs SQL, auth or
 * parameters. Not a product proxy and intentionally does not implement TLS. */
export async function skillCommitFault(databaseUrl:string){
 assert.equal(process.env.MA24_DISPOSABLE_LOCKED_POLICY,'1');
 const target=new URL(databaseUrl);assert.equal(target.hostname,'127.0.0.1');
 assert.equal(target.pathname,'/network_copilot_local');
 assert(!target.searchParams.has('sslmode'));
 const sockets=new Set<net.Socket>();
 const stats={targetCommits:0,completedAuditInserts:0,backendCommits:0,droppedCommitAcks:0,blockedCommits:0,protocolFailures:0};
 let mode:'after'|'before'|undefined;
 const frames=(consume:(type:string,body:Buffer,packet:Buffer)=>void)=>{
  let buffer:Buffer=Buffer.alloc(0);
  return (chunk:Buffer)=>{
   buffer=Buffer.concat([buffer,chunk]);
   while(buffer.length>=5){
    const size=buffer.readUInt32BE(1);assert(size>=4&&size<=64*1024*1024);
    if(buffer.length<size+1)return;
    const packet=buffer.subarray(0,size+1);buffer=buffer.subarray(size+1);
    consume(String.fromCharCode(packet[0]),packet.subarray(5),packet);
   }
  };
 };
 const server=net.createServer(downstream=>{
  downstream.pause();const upstream=net.connect({host:target.hostname,port:Number(target.port)});
  sockets.add(downstream);sockets.add(upstream);
  let closed=false,candidate=false,auditComplete=false,awaitingAudit=false,suppress=false,commitComplete=false;
  const close=()=>{if(closed)return;closed=true;downstream.destroy();upstream.destroy();sockets.delete(downstream);sockets.delete(upstream);};
  const fail=()=>{stats.protocolFailures++;close();};
  downstream.on('error',close);upstream.on('error',close);downstream.on('close',close);upstream.on('close',close);
  const frontend=frames((type,body,packet)=>{
   const sql=type==='Q'?body.subarray(0,-1).toString('utf8'):type==='P'?body.subarray(body.indexOf(0)+1).toString('utf8').split('\0',1)[0]:undefined;
   if(sql!==undefined){
    const normalized=sql.trim().replace(/\s+/g,' ').toLowerCase();
    if(/^(begin|rollback)\b/.test(normalized)){candidate=false;auditComplete=false;awaitingAudit=false;}
    if(normalized.startsWith('insert into agent_run_event(user_id,run_id,kind,payload)')&&normalized.includes("'skill_activated'")){
     candidate=true;awaitingAudit=true;
    }
    if(normalized==='commit'&&candidate&&mode){
     assert(auditComplete,'Activation audit must complete before fault injection');stats.targetCommits++;
     const chosen=mode;mode=undefined;
     if(chosen==='before'){stats.blockedCommits++;close();return;}
     suppress=true;
    }
   }
   upstream.write(packet);
  });
  const backend=frames((type,body,packet)=>{
   if(type==='C'&&awaitingAudit){
    auditComplete=body.toString('utf8')==='INSERT 0 1\0';awaitingAudit=false;
    if(auditComplete)stats.completedAuditInserts++;
   }
   if(suppress){
    if(type==='C'&&body.toString('utf8')==='COMMIT\0'){stats.backendCommits++;commitComplete=true;return;}
    if(type==='Z'){assert(commitComplete&&body.length===1&&body[0]===73);stats.droppedCommitAcks++;close();return;}
    if(type==='E')throw new Error('Activation commit unexpectedly rejected');
   }
   downstream.write(packet);
  });
  let startup:Buffer=Buffer.alloc(0),started=false;
  downstream.on('data',(chunk:Buffer)=>{try{
   if(started){frontend(chunk);return;}
   startup=Buffer.concat([startup,chunk]);if(startup.length<4)return;
   const size=startup.readUInt32BE(0);assert(size>=8&&size<=10000);if(startup.length<size)return;
   assert.equal(startup.readUInt32BE(4),196608,'Only plaintext loopback v3 startup permitted');
   upstream.write(startup.subarray(0,size));started=true;
   if(startup.length>size)frontend(startup.subarray(size));startup=Buffer.alloc(0);
  }catch{fail();}});
  upstream.on('data',(chunk:Buffer)=>{try{backend(chunk);}catch{fail();}});
  upstream.once('connect',()=>downstream.resume());
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();assert(address&&typeof address!=='string');
 const url=new URL(target);url.port=String(address.port);
 return {url:url.toString(),stats,arm(next:'after'|'before'){assert.equal(mode,undefined);mode=next;},
  async close(){for(const socket of sockets)socket.destroy();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
