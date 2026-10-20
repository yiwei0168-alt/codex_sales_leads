// Isolated TLS status-response fixture. Never forwards requests or runs inference.
import https from 'node:https';
import http from 'node:http';
import {readFile,unlink} from 'node:fs/promises';
const path='/tmp/ma24-batch-stub-config.json';let config;
for(let i=0;i<200;i++){
 try{config=JSON.parse(await readFile(path,'utf8'));break;}
 catch(error){if(error.code!=='ENOENT')throw error;await new Promise(resolve=>setTimeout(resolve,100));}
}
if(!config?.key||!config?.cert||!config?.jobs)throw new Error('Synthetic batch stub configuration unavailable');
await unlink(path);
const stats={statusGetRequests:0,byId:{},inferencePosts:0,nonStatusRequests:0,authenticationFailures:0};
const server=https.createServer({key:config.key,cert:config.cert,minVersion:'TLSv1.2'},(request,response)=>{
 response.setHeader('content-type','application/json');
 if(request.method!=='GET'){
  if(request.method==='POST')stats.inferencePosts++;stats.nonStatusRequests++;response.writeHead(405);response.end('{}');return;
 }
 if(request.headers.authorization!=='Bearer synthetic-local-batch-key'||request.headers.host!=='openrouter.ai:8443'){
  stats.authenticationFailures++;response.writeHead(401);response.end('{}');return;
 }
 const id=request.url?.startsWith('/api/v1/batches/')?request.url.slice('/api/v1/batches/'.length):'';
 if(!Object.hasOwn(config.jobs,id)){stats.nonStatusRequests++;response.writeHead(404);response.end('{}');return;}
 stats.statusGetRequests++;stats.byId[id]=(stats.byId[id]??0)+1;response.end(JSON.stringify(config.jobs[id]));
});
const control=http.createServer((request,response)=>{
 response.setHeader('content-type','application/json');
 if(request.method==='GET'&&request.url==='/status'){response.end(JSON.stringify(stats));return;}
 response.writeHead(404);response.end('{}');
});
await Promise.all([new Promise(resolve=>server.listen(8443,'0.0.0.0',resolve)),new Promise(resolve=>control.listen(8444,'127.0.0.1',resolve))]);
console.log('syntheticBatchTlsStatusReady');
const stop=()=>{server.close();control.close();setTimeout(()=>process.exit(0),100).unref();};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
