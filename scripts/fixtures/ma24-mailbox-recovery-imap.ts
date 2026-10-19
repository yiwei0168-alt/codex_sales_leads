import {createHash} from 'node:crypto';
import type {readAliMailMessages as RealReader, ImportedMailboxMessage} from '../../src/lib/mailbox/alimail-imap';

export async function verifyAliMailCredentials(){throw new Error('Real credential verification disabled in synthetic fixture');}
export const readAliMailMessages:typeof RealReader=async input=>{
  const remaining=[1,2,3].filter(uid=>!input.knownMessages?.has(`INBOX:1:${uid}`));
  if(process.env.MA24_SYNTHETIC_MAILBOX_HOLD==='1'&&remaining.length===2){
    await input.onProgress?.({phase:'fetching',currentSubject:'ma24-synthetic-hold',folders:1,discovered:2,processed:0});
    await new Promise(()=>{setInterval(()=>undefined,1000);});
  }
  const selected=remaining.slice(0,input.maxMessages);
  const messages:ImportedMailboxMessage[]=selected.map(uid=>{
    const bodyText=`Synthetic mailbox recovery message ${uid}; not real business data.`;
    return {folderPath:'INBOX',uidValidity:'1',uid,direction:'inbound',sender:[{address:'sender@example.invalid'}],
      recipients:[{address:input.email}],subject:`Synthetic ${uid}`,bodyText,
      contentSha256:createHash('sha256').update(bodyText).digest('hex'),metadata:{syntheticFixture:true}};
  });
  return {messages,cursors:[],folders:1,discovered:remaining.length};
};
