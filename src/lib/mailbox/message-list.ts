import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';

/** Published return shape lets programs aggregate in one pass instead of probing live data. */
export const mailboxMessageListData=z.object({
 items:z.array(z.object({id:z.uuid(),sentAt:z.string().describe('Explicit timestamp with numeric offset; pass to tools.time for sorting or day grouping.'),
  direction:z.enum(['inbound','outbound']),sourceUrl:z.string()})),
 interval:z.object({from:z.string(),until:z.string(),fromInclusive:z.literal(true),untilExclusive:z.literal(true)}),
 offset:z.number().int().min(0),hasMore:z.boolean(),nextOffset:z.number().int().min(0).nullable(),paginationLimitReached:z.boolean(),scope:z.string(),
});

export const mailboxMessageListInput=z.object({
 from:z.iso.datetime({offset:true}),until:z.iso.datetime({offset:true}),
 offset:z.number().int().min(0).max(100000).default(0),
}).strict().refine(v=>Date.parse(v.until)>Date.parse(v.from)&&Date.parse(v.until)-Date.parse(v.from)<=366*86400000,
 'Use an explicit increasing timestamp interval of at most 366 days; split longer requested intervals.');

/** Account-wide imported metadata only: no credential lookup, body decryption, IMAP or model. */
export async function listImportedMailMetadata(userId:string,input:unknown){
 const p=mailboxMessageListInput.parse(input);
 const rows=await tenantQuery<{id:string;sentAt:string;direction:string}>(userId,
  `select id,sent_at::text as "sentAt",direction from mailbox_message
   where user_id=$1 and sent_at >= $2::timestamptz and sent_at < $3::timestamptz
   and not coalesce((metadata->>'rawContentPurged')::boolean,false)
   order by sent_at,id limit 21 offset $4`,[userId,p.from,p.until,p.offset]);
 const hasMore=rows.length>20,paginationLimitReached=hasMore&&p.offset+20>100000;
 return {items:rows.slice(0,20).map(row=>({...row,sourceUrl:`/api/mailbox/messages/${row.id}`})),
  interval:{from:p.from,until:p.until,fromInclusive:true,untilExclusive:true},offset:p.offset,hasMore,
  nextOffset:hasMore&&!paginationLimitReached?p.offset+20:null,paginationLimitReached,
  scope:'Current-account imported inbound and outbound message metadata, including unlinked mail. Excludes purged raw content and messages without a sent timestamp. Not an inbox synchronization; no bodies read. Count each returned message ID once; follow all pages before claiming complete coverage.'};
}
