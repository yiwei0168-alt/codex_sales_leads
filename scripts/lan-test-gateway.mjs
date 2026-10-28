import https from 'node:https';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// TLS terminates here; Web, business API and databases remain loopback-only.
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const config=JSON.parse(await readFile(resolve(root,'.local-runtime/lan-gateway.json'),'utf8'));
if(!/^192\.168\.\d{1,3}\.\d{1,3}$/.test(config.address)||config.port!==3443)throw Error('Invalid LAN gateway configuration');
const authority=`${config.address}:${config.port}`;
const origin=`https://${authority}`;
const hop=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
const clean=headers=>{
 const excluded=new Set([...hop,...String(headers.connection??'').toLowerCase().split(',').map(token=>token.trim())]);
 return Object.fromEntries(Object.entries(headers).filter(([key])=>!excluded.has(key)&&!key.startsWith('x-forwarded-')&&key!=='forwarded'));
};
const server=https.createServer({key:await readFile(resolve(root,'.local-runtime/lan-key.pem')),cert:await readFile(resolve(root,'.local-runtime/lan-cert.pem')),minVersion:'TLSv1.2'},(request,response)=>{
 if(request.headers.host!==authority){response.writeHead(421);response.end('Unexpected host');request.resume();return;}
 if(request.headers.origin&&request.headers.origin!==origin){response.writeHead(403);response.end('Unexpected origin');request.resume();return;}
 const headers={...clean(request.headers),host:authority,'x-forwarded-host':authority,'x-forwarded-proto':'https','x-forwarded-port':String(config.port),'x-forwarded-for':request.socket.remoteAddress};
 const upstream=http.request({hostname:'127.0.0.1',port:3001,path:request.url,method:request.method,headers},incoming=>{
  response.writeHead(incoming.statusCode??502,clean(incoming.headers));incoming.pipe(response);
  incoming.on('error',()=>response.destroy());
 });
 upstream.on('error',()=>{if(!response.headersSent){response.writeHead(502);response.end('Product temporarily unavailable');}else response.destroy();});
 request.on('aborted',()=>upstream.destroy());request.on('error',()=>upstream.destroy());
 response.on('close',()=>{if(!response.writableEnded)upstream.destroy();});request.pipe(upstream);
});
server.requestTimeout=300_000;server.headersTimeout=30_000;server.keepAliveTimeout=5000;
server.on('upgrade',(_request,socket)=>socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n'));
server.on('error',error=>{console.error('LAN gateway failed:',error.code??error.name);process.exitCode=1;});
server.listen(config.port,config.address,()=>console.log(JSON.stringify({gateway:origin,upstream:'http://127.0.0.1:3001',startedAt:new Date().toISOString()})));
