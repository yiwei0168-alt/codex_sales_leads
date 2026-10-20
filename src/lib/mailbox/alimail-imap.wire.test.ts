import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {startMa24ImapWireServer} from '../../../scripts/lib/ma24-imap-wire-server';

// Opt-in: actual ImapFlow + mailparser over local verified TLS. Only DNS and the
// fixture CA are substituted; the product reader and protocol library are real.
const fixture=vi.hoisted(()=>({ca:'',port:0,validity:1,disconnect:false,commands:[] as string[]}));
vi.mock('./connection-config',()=>({publicMailAddresses:async()=>['127.0.0.1']}));
vi.mock('imapflow',async importOriginal=>{
 const actual=await importOriginal<typeof import('imapflow')>();
 return {...actual,ImapFlow:class extends actual.ImapFlow{
  constructor(options:ConstructorParameters<typeof actual.ImapFlow>[0]){super({...options,tls:{...options.tls,ca:fixture.ca}});}
 }};
});
import {readAliMailMessages,type MailboxCursor} from './alimail-imap';

const enabled=process.env.MA24_IMAP_WIRE==='1';
let wire:Awaited<ReturnType<typeof startMa24ImapWireServer>>|undefined;
beforeAll(async()=>{if(enabled)wire=await startMa24ImapWireServer(fixture);},30000);
afterAll(async()=>{await wire?.close();});

it.skipIf(!enabled)('reads date-bounded pages, resumes, resets UIDVALIDITY and rejects disconnected fetches over verified TLS',async()=>{
 const common={email:'owner@example.invalid',password:'synthetic-local-only',host:'imap.example.invalid',port:fixture.port,
  since:new Date('2026-10-02T00:00:00Z'),before:new Date('2026-10-04T00:00:00Z'),maxMessages:2};
 const first=await readAliMailMessages({...common,cursors:new Map()});
 expect(first.discovered).toBe(4);expect(first.messages.map(m=>[m.folderPath,m.uid])).toEqual([['INBOX',2],['INBOX',4]]);
 const cursors=new Map<string,MailboxCursor>(first.cursors.map(c=>[c.folderPath,c]));
 const second=await readAliMailMessages({...common,cursors});
 expect(second.messages.map(m=>[m.folderPath,m.uid,m.direction])).toEqual([['Sent',3,'outbound'],['Sent',6,'outbound']]);
 const known=new Set([...first.messages,...second.messages].map(m=>`${m.folderPath}:${m.uidValidity}:${m.uid}`));
 const done=await readAliMailMessages({...common,cursors:new Map(),knownMessages:known});expect(done.messages).toEqual([]);expect(done.discovered).toBe(0);
 fixture.validity=2;
 const reset=await readAliMailMessages({...common,cursors,knownMessages:known,folderScope:'inbox'});
 expect(reset.messages.map(m=>[m.uidValidity,m.uid])).toEqual([['2',2],['2',4]]);
 fixture.disconnect=true;
 let processedBeforeDisconnect=0;
 await expect(readAliMailMessages({...common,cursors:new Map(),folderScope:'inbox',onProgress:p=>{
  processedBeforeDisconnect=Math.max(processedBeforeDisconnect,p.processed);
  if(p.processed===1)wire?.disconnectHeld();
 }})).rejects.toThrow();
 expect(processedBeforeDisconnect).toBe(1);
 const retry=await readAliMailMessages({...common,cursors:new Map(),folderScope:'inbox'});
 expect(retry.messages.map(m=>m.uid)).toEqual([2,4]);
 const loginCount=fixture.commands.filter(c=>c==='LOGIN').length;
 await expect(readAliMailMessages({...common,host:'wrong.example.invalid',cursors:new Map()})).rejects.toThrow(/hostname|altnames/i);
 expect(fixture.commands.filter(c=>c==='LOGIN')).toHaveLength(loginCount);
 expect(fixture.commands.some(c=>/^SELECT\b/i.test(c))).toBe(false);
 expect(fixture.commands.some(c=>/^UID FETCH.*BODY\.PEEK\[/i.test(c))).toBe(true);
 expect(fixture.commands.filter(c=>/^UID SEARCH/i.test(c)).every(c=>c.includes('SINCE')&&c.includes('BEFORE'))).toBe(true);
 expect(fixture.commands.some(c=>/^(APPEND|STORE|EXPUNGE|UID STORE|UID MOVE|UID COPY)\b/i.test(c))).toBe(false);
},30000);
