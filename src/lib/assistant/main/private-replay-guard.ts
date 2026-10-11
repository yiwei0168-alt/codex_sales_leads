import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';
import {getMailboxMessageForReview} from '@/lib/mailbox/repository';
import {listMailboxCustomers,readCustomerTimeline} from '@/lib/mailbox/customer-timeline';
import {digest,type ModelMessage} from './contracts';

export const PRIVATE_REPLAY_TOOLS=['mail_read','customer_timeline'] as const;
const mailInput=z.object({messageId:z.uuid()}).strict();
const timelineInput=z.object({customerId:z.uuid().optional(),country:z.string().max(7).optional(),offset:z.number().int().min(0).max(100000).default(0)}).strict();
const wireHash=(value:unknown)=>digest(JSON.parse(JSON.stringify(value)));

/** Deterministic local rereads only. Never invokes a product dispatcher, IMAP or a model. */
export async function assertCurrentPrivateReplayMessages(userId:string,messages:ModelMessage[]){
  const calls=new Map<string,{tool:string;arguments:unknown}>();
  for(const message of messages)if(message.role==='assistant')for(const call of message.tool_calls??[]){
    if(call.function.name!=='execute_tool')continue;
    try{const p=JSON.parse(call.function.arguments);if(PRIVATE_REPLAY_TOOLS.some(id=>id===p.tool))calls.set(call.id,p);}catch{/* No executable pair. */}
  }
  for(const message of messages){
    if(message.role!=='tool')continue;
    const call=calls.get(message.tool_call_id??'');if(!call)continue;
    const output=JSON.parse(message.content??'{}');
    if(!['success','partial'].includes(output.status)||!output.data)throw new Error('Private replay source unavailable');
    let current:unknown;
    if(call.tool==='mail_read'){
      const p=mailInput.parse(call.arguments);
      const rows=await tenantQuery(userId,`select id from mailbox_message where user_id=$1 and id=$2
        and not coalesce((metadata->>'rawContentPurged')::boolean,false)`,[userId,p.messageId]);
      if(rows.length!==1)throw new Error('Private replay source unavailable');
      current=await getMailboxMessageForReview(userId,p.messageId);
    }else{
      const p=timelineInput.parse(call.arguments);
      if(p.customerId){
        const timeline=await readCustomerTimeline(userId,p.customerId,p.offset);
        if(!timeline||timeline.customer.archived)throw new Error('Private replay source unavailable');
        current=timeline;
      }else current=await listMailboxCustomers(userId,{country:p.country,offset:p.offset});
    }
    if(!current||wireHash(current)!==wireHash(output.data))throw new Error('Private replay source changed');
  }
}
