// Disposable fault injector, not a product database proxy. PostgreSQL v3 wire
// format: https://www.postgresql.org/docs/16/protocol-message-formats.html
// TLS is terminated with the disposable database certificate and independently
// verified upstream. No SQL, parameters, authentication or key bytes are logged.
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import {readFile,unlink} from 'node:fs/promises';

const configuration='/tmp/ma24-pg-proxy-config.json';
let input;
for(let n=0;n<200;n++){
 try{input=JSON.parse(await readFile(configuration,'utf8'));break;}
 catch(error){if(error.code!=='ENOENT')throw error;await new Promise(done=>setTimeout(done,100));}
}
if(!input?.key||!input?.cert)throw new Error('Disposable proxy TLS configuration missing');
await unlink(configuration);
const stats={ready:false,armed:false,downstreamTlsConnections:0,verifiedUpstreamTlsConnections:0,
 targetCommitCommands:0,backendCommitCompletions:0,suppressedCommitCompletions:0,suppressedReadyForQuery:0,droppedCommitAcks:0,
 blockedCommitCommands:0,blockedAfterSuccessfulInsert:0,protocolFailures:0};
let faultMode='after-commit';
const sslRequest=Buffer.from([0,0,0,8,4,210,22,47]);
const sockets=new Set();
const fail=(...connections)=>{stats.protocolFailures++;for(const socket of connections)socket?.destroy();};
function frames(consume){
 let buffer=Buffer.alloc(0);
 return chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  while(buffer.length>=5){
   const length=buffer.readUInt32BE(1);
   if(length<4||length>64*1024*1024)throw new Error('Invalid protocol frame');
   if(buffer.length<length+1)return;
   const packet=buffer.subarray(0,length+1);buffer=buffer.subarray(length+1);
   consume(String.fromCharCode(packet[0]),packet.subarray(5),packet);
  }
 };
}
const decrypted=tls.createServer({key:input.key,cert:input.cert,minVersion:'TLSv1.2'},async downstream=>{
 stats.downstreamTlsConnections++;sockets.add(downstream);downstream.pause();
 const raw=net.connect({host:'pilot-db',port:5432});sockets.add(raw);
 let upstream,closed=false;
 const close=()=>{if(closed)return;closed=true;downstream.destroy();upstream?.destroy();raw.destroy();sockets.delete(downstream);sockets.delete(raw);if(upstream)sockets.delete(upstream);};
 downstream.on('error',close);downstream.on('close',close);raw.on('error',close);
 try{
  await new Promise((resolve,reject)=>{raw.once('connect',resolve);raw.once('error',reject);});
  const accepted=new Promise((resolve,reject)=>{
   raw.once('data',data=>data.length===1&&data[0]===83?resolve():reject(new Error('Upstream SSL request rejected')));
   raw.once('error',reject);
  });
  raw.write(sslRequest);await accepted;
  upstream=tls.connect({socket:raw,servername:'pilot-db',ca:input.cert,rejectUnauthorized:true,minVersion:'TLSv1.2'});
  sockets.add(upstream);upstream.on('error',close);upstream.on('close',close);
  await new Promise((resolve,reject)=>{upstream.once('secureConnect',resolve);upstream.once('error',reject);});
  if(!upstream.authorized)throw new Error('Upstream TLS verification failed');
  stats.verifiedUpstreamTlsConnections++;
  let candidate=false,suppress=false,commitComplete=false,awaitingExtraction=false,extractionCompleted=false;
  const frontend=frames((type,body,packet)=>{
   if(closed)return;
   const query=type==='Q'?body.subarray(0,-1).toString('utf8'):type==='P'?body.subarray(body.indexOf(0)+1).toString('utf8').split('\0',1)[0]:undefined;
   if(query!==undefined){
    const normalized=query.trim().replace(/\s+/g,' ').toLowerCase();
    if(/^(begin|rollback)\b/.test(normalized)){candidate=false;awaitingExtraction=false;extractionCompleted=false;}
    // The actual finishRun transaction writes this job only after a successful
    // completed main-agent UPDATE. An earlier rollback clears the candidate.
    if(normalized.startsWith('insert into agent_memory_extraction_job(owner_id,run_id) values($1,$2)')){candidate=true;awaitingExtraction=true;}
    if(normalized==='commit'&&candidate&&stats.armed){
     stats.armed=false;stats.targetCommitCommands++;
     if(faultMode==='before-commit'){
      if(!extractionCompleted)throw new Error('Target insert did not complete before commit');
      // The real INSERT already succeeded inside the open transaction. Do not
      // forward COMMIT; closing upstream forces PostgreSQL to roll it back.
      stats.blockedCommitCommands++;stats.blockedAfterSuccessfulInsert++;close();return;
     }
     suppress=true;
    }
   }
   upstream.write(packet);
  });
  const backend=frames((type,body,packet)=>{
   if(closed)return;
   if(type==='C'&&awaitingExtraction){
    extractionCompleted=body.toString('utf8')==='INSERT 0 1\0';awaitingExtraction=false;
   }
   if(suppress){
    if(type==='C'&&body.toString('utf8')==='COMMIT\0'){
     stats.backendCommitCompletions++;stats.suppressedCommitCompletions++;commitComplete=true;return;
    }
    if(type==='Z'){
     if(!commitComplete||body.length!==1||body[0]!==73)throw new Error('Target commit did not reach idle');
     stats.suppressedReadyForQuery++;stats.droppedCommitAcks++;close();return;
    }
    if(type==='E')throw new Error('Target commit failed');
   }
   downstream.write(packet);
  });
  let startup=Buffer.alloc(0),started=false;
  downstream.on('data',chunk=>{try{
   if(started){frontend(chunk);return;}
   startup=Buffer.concat([startup,chunk]);if(startup.length<4)return;
   const length=startup.readUInt32BE(0);if(length<8||length>10000)throw new Error('Invalid startup frame');
   if(startup.length<length)return;upstream.write(startup.subarray(0,length));started=true;
   if(startup.length>length)frontend(startup.subarray(length));startup=Buffer.alloc(0);
  }catch{fail(downstream,upstream,raw);}});
  upstream.on('data',chunk=>{try{backend(chunk);}catch{fail(downstream,upstream,raw);}});
  downstream.resume();
 }catch{fail(downstream,upstream,raw);}
});
decrypted.on('tlsClientError',()=>{stats.protocolFailures++;});
const server=net.createServer(socket=>{
 sockets.add(socket);socket.on('error',()=>socket.destroy());socket.on('close',()=>sockets.delete(socket));
 let startup=Buffer.alloc(0);
 const hello=chunk=>{
  startup=Buffer.concat([startup,chunk]);if(startup.length<8)return;
  socket.removeListener('data',hello);
  if(startup.length!==8||!startup.equals(sslRequest)){fail(socket);return;}
  socket.write('S');decrypted.emit('connection',socket);
 };
 socket.on('data',hello);
});
const control=http.createServer((request,response)=>{
 response.setHeader('content-type','application/json');
 if(request.method==='POST'&&request.url==='/arm'&&!stats.armed&&!stats.targetCommitCommands){stats.armed=true;response.end(JSON.stringify(stats));return;}
 if(request.method==='POST'&&request.url==='/arm-before-commit'&&!stats.armed&&stats.droppedCommitAcks===1&&!stats.blockedCommitCommands){
  faultMode='before-commit';stats.armed=true;response.end(JSON.stringify(stats));return;
 }
 if(request.method==='GET'&&request.url==='/status'){response.end(JSON.stringify(stats));return;}
 response.writeHead(409);response.end('{}');
});
await Promise.all([new Promise(resolve=>server.listen(5540,'0.0.0.0',resolve)),new Promise(resolve=>control.listen(5541,'127.0.0.1',resolve))]);
stats.ready=true;console.log('disposableCommitProxyReady');
const shutdown=()=>{for(const socket of sockets)socket.destroy();server.close();control.close();setTimeout(()=>process.exit(0),100).unref();};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
