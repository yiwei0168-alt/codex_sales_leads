import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import tls from 'node:tls';
import type {AddressInfo} from 'node:net';

export interface ImapWireFixtureState {ca:string;port:number;validity:number;disconnect:boolean;disconnectFolder?:string;commands:string[]}
const rows=[
 {folder:'INBOX',uid:1,day:'2026-10-01'},
 {folder:'INBOX',uid:2,day:'2026-10-02'},
 {folder:'INBOX',uid:4,day:'2026-10-03'},
 {folder:'INBOX',uid:7,day:'2026-10-04'},
 {folder:'Sent',uid:3,day:'2026-10-02'},
 {folder:'Sent',uid:6,day:'2026-10-03'},
];
const imapDate=(value:string)=>{
 const [day,month,year]=value.split('-');
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 return `${year}-${String(months.findIndex(m=>m.toLowerCase()===month.toLowerCase())+1).padStart(2,'0')}-${day.padStart(2,'0')}`;
};

export async function startMa24ImapWireServer(fixture:ImapWireFixtureState,provided?:{key:string;cert:string;host:string}){
 let partialSocket:tls.TLSSocket|undefined;
 const sockets=new Set<tls.TLSSocket>();
 // Ephemeral test key stays in memory; no key or real credentials are logged.
 const pem=provided?'':execFileSync('docker',['run','--rm','--network','none','--entrypoint','openssl','pgvector/pgvector:pg16',
  'req','-x509','-nodes','-newkey','rsa:2048','-days','1','-subj','/CN=imap.example.invalid',
  '-addext','subjectAltName=DNS:imap.example.invalid','-keyout','/dev/stdout','-out','/dev/stdout'],{windowsHide:true,stdio:['ignore','pipe','pipe']}).toString();
 const key=provided?.key??pem.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/)?.[0];
 fixture.ca=provided?.cert??pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0]??'';
 assert(key);assert(fixture.ca);
 const server=tls.createServer({key,cert:fixture.ca},socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>undefined);
  socket.write('* OK [CAPABILITY IMAP4rev1] Synthetic IMAP ready\r\n');
  let buffer='',folder='INBOX';
  socket.on('data',chunk=>{
   buffer+=chunk.toString();
   for(let end;(end=buffer.indexOf('\r\n'))>=0;){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
    const match=/^(\S+) (.*)$/.exec(line);if(!match){socket.destroy();return;}
    const [,tag,command]=match;
    // Keep only command names/ranges; never retain LOGIN arguments.
    fixture.commands.push(/^LOGIN\b/i.test(command)?'LOGIN':command);
    const ok=(extra='')=>socket.write(`${extra}${tag} OK completed\r\n`);
    if(/^CAPABILITY$/i.test(command))ok('* CAPABILITY IMAP4rev1\r\n');
    else if(/^LOGIN\b/i.test(command))ok();
    else if(/^LIST "" ""$/i.test(command))ok('* LIST (\\Noselect) "/" ""\r\n');
    else if(/^LIST\b/i.test(command))ok('* LIST (\\Inbox) "/" "INBOX"\r\n* LIST (\\Sent) "/" "Sent"\r\n');
    else if(/^LSUB\b/i.test(command))ok();
    else if(/^EXAMINE\b/i.test(command)){
     folder=command.includes('Sent')?'Sent':'INBOX';
     ok(`* ${rows.filter(r=>r.folder===folder).length} EXISTS\r\n* FLAGS (\\Seen)\r\n* OK [UIDVALIDITY ${fixture.validity}] valid\r\n* OK [UIDNEXT 8] next\r\n`);
    }else if(/^UID SEARCH\b/i.test(command)){
     const since=/SINCE "?([\d]+-[A-Za-z]+-[\d]+)"?/i.exec(command)?.[1];
     const before=/BEFORE "?([\d]+-[A-Za-z]+-[\d]+)"?/i.exec(command)?.[1];
     const after=/UID (\d+):\*/i.exec(command)?.[1];
     const uids=rows.filter(r=>r.folder===folder&&(!since||r.day>=imapDate(since))&&(!before||r.day<imapDate(before))&&(!after||r.uid>=Number(after))).map(r=>r.uid);
     ok(`* SEARCH${uids.length?' '+uids.join(' '):''}\r\n`);
    }else if(/^UID FETCH\b/i.test(command)){
     const selection=command.split(' ')[2];
     const selected=(uid:number)=>selection.split(',').some(part=>{const [lo,hi]=part.split(':').map(Number);return hi===undefined?uid===lo:uid>=lo&&uid<=hi;});
     let emitted=0;
     for(const row of rows.filter(r=>r.folder===folder&&selected(r.uid))){
      if(fixture.disconnect&&emitted===1&&(!fixture.disconnectFolder||fixture.disconnectFolder===folder)){fixture.disconnect=false;partialSocket=socket;return;}
      const source=Buffer.from(`From: source@example.invalid\r\nTo: owner@example.invalid\r\nSubject: Wire ${folder} ${row.uid}\r\nDate: ${new Date(row.day+'T12:00:00Z').toUTCString()}\r\nMessage-ID: <${folder}-${row.uid}@example.invalid>\r\n\r\nSynthetic body ${row.uid}\r\n`);
      const sequence=rows.filter(r=>r.folder===folder).findIndex(r=>r.uid===row.uid)+1;
      socket.write(`* ${sequence} FETCH (UID ${row.uid} INTERNALDATE "${row.day.slice(8)}-Oct-2026 12:00:00 +0000" RFC822.SIZE ${source.length} BODY[] {${source.length}}\r\n`);socket.write(source);socket.write(')\r\n');
      emitted++;
     }
     ok();
    }else if(/^LOGOUT$/i.test(command)){socket.end(`* BYE done\r\n${tag} OK logout\r\n`);}
    else if(/^(NOOP|CLOSE|UNSELECT)$/i.test(command))ok();
    else socket.write(`${tag} BAD Unsupported fixture command\r\n`);
   }
  });
 });
 await new Promise<void>(resolve=>server!.listen(0,provided?.host??'127.0.0.1',resolve));fixture.port=(server.address() as AddressInfo).port;

 return {ca:fixture.ca,port:fixture.port,held:()=>Boolean(partialSocket&&!partialSocket.destroyed),disconnectHeld:()=>{if(!partialSocket)return false;partialSocket.destroy();partialSocket=undefined;return true;},
  close:async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
