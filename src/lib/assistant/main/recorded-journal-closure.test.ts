import {it,expect} from 'vitest';
import {digest} from './contracts';
import {assertRecordedJournalClosure} from './recorded-journal-closure';
import type {RecordedEvidenceReceipt} from './recorded-evidence-receipts';
const context={userId:'owner',runId:'task'};
function fixture(){
 const model:RecordedEvidenceReceipt={id:'m',user_id:'owner',run_id:'task',call_key:'mode-model:0:0:0',tool_id:'main_model',tool_version:'1',input:{},input_hash:digest({}),output:{status:'success'},status:'completed',effect:'model',approval_id:null};
 const read={...model,id:'r',call_key:'read',tool_id:'knowledge_search',effect:'read'};
 return {rows:[model,read],bindings:[{id:read.id,hash:digest(read)}]};
}
it('binds every journal row and deduplicates repeated consumption of the same read',()=>{
 const f=fixture();expect(assertRecordedJournalClosure(context,f.rows,['m'],[...f.bindings,...f.bindings])).toMatchObject({completeReadOnlyJournalVerified:true,modelAttempts:1,consumedReads:1,executionAuthorized:false,qualityAccepted:false});
});
it.each(['write','read','model'])('rejects an extra %s operation even if the visible conversation is valid',effect=>{
 const f=fixture();f.rows.push({...f.rows[1],id:'hidden',effect});expect(()=>assertRecordedJournalClosure(context,f.rows,['m'],f.bindings)).toThrow('unconsumed');
});
it.each(['started','failed','waiting_approval'])('rejects incomplete receipt status %s',status=>{
 const f=fixture();f.rows[1].status=status;expect(()=>assertRecordedJournalClosure(context,f.rows,['m'],f.bindings)).toThrow('incomplete');
});
it('rejects missing rows, changed hashes, changed account and changed run',()=>{
 for(const key of ['missing','input','account','run','approval','output']){
  const f=fixture();if(key==='missing')f.rows.pop();if(key==='input')f.rows[1].input={changed:true};if(key==='account')f.rows[1].user_id='other';if(key==='run')f.rows[1].run_id='other';if(key==='approval')f.rows[1].approval_id='approval';if(key==='output')f.rows[1].output={changed:true};
  expect(()=>assertRecordedJournalClosure(context,f.rows,['m'],f.bindings)).toThrow();
 }
});
it('rejects duplicate identities and inconsistent cumulative receipt bindings',()=>{
 const f=fixture();expect(()=>assertRecordedJournalClosure(context,[...f.rows,f.rows[0]],['m'],f.bindings)).toThrow();
 expect(()=>assertRecordedJournalClosure(context,f.rows,['m','m'],f.bindings)).toThrow();
 expect(()=>assertRecordedJournalClosure(context,f.rows,['m'],[...f.bindings,{id:'r',hash:digest('changed')}])).toThrow();
 expect(()=>assertRecordedJournalClosure(context,f.rows,['m'],[{id:'m',hash:digest(f.rows[0])}])).toThrow();
});
