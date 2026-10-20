import {digest} from './contracts';
import {modelReplySchema} from './model';
import {orderedModeDecision} from './mode-fallback';

type Journal<T>=Parameters<typeof orderedModeDecision<T>>[0];
function reply(value:unknown){
 const parsed=modelReplySchema.parse(value);
 if(!parsed.content?.trim()&&!parsed.tool_calls?.length)throw new Error('Main model returned no content');
 if(new Set(parsed.tool_calls?.map(call=>call.id)).size!==(parsed.tool_calls?.length??0))throw new Error('Duplicate tool call identity');
 return {...parsed,content:parsed.content??null};
}

/** Shared production/evaluation response lifecycle. Journal callbacks retain
 * their own authorization, transport signatures, accounting and storage roles.
 * Invalid completed responses remain durable for reconciliation; they cannot be
 * consumed or cause another paid attempt on this decision or recovery. */
export async function runJournaledModeModel<T extends Record<string,unknown>>(deps:Journal<T>&{
 callScope:(index:number)=>Record<string,unknown>;
}):Promise<T&{message:ReturnType<typeof reply>}>{
 const selected=await orderedModeDecision<T>({signal:deps.signal,begin:deps.begin,save:deps.save,
  request:async index=>{
   const response=await deps.request(index);
   let message:ReturnType<typeof reply>;
   try{message=reply(response.message);}catch{return response;}
   if(message.tool_calls)message.tool_calls=message.tool_calls.map((call,i)=>({...call,
    id:`call_${digest({...deps.callScope(index),i,id:call.id}).slice(0,40)}`}));
   return {...response,message};
  },
 });
 // Recovered success is validated, but its already-stable call IDs are never
 // stamped a second time. A malformed saved response cannot trigger fallback.
 return {...selected,message:reply(selected.message)};
}
