import {expect,it,vi} from 'vitest';
import {z} from 'zod';
import {digest,result,type ModelMessage} from './contracts';
import {defineTool} from './tool-definition';
import {bindRecordedEvidenceReceipts,type RecordedEvidenceReceipt} from './recorded-evidence-receipts';
const id='00000000-0000-4000-8000-000000000001',context={userId:'owner',runId:'run'};
const execute=vi.fn(async()=>result(null));
const tool=defineTool({id:'fixture',description:'Synthetic read',input:z.object({limit:z.number().default(8)}).strict(),execute});
function fixture(){
 const output=result([{content:'Synthetic source'}],{callId:id});
 const messages:ModelMessage[]=[{role:'assistant',content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'fixture',arguments:{}})}}]},
 {role:'tool',tool_call_id:'call-1',content:JSON.stringify(output)}];
 const row:RecordedEvidenceReceipt={id,user_id:'owner',run_id:'run',call_key:'call-1',tool_id:'fixture',tool_version:'1',input:{limit:8},input_hash:digest({limit:8}),effect:'read',status:'completed',output,approval_id:null};
 return {messages,row};
}
it('binds exact normalized input and saved output without invoking the tool',()=>{
 const {messages,row}=fixture();expect(bindRecordedEvidenceReceipts(context,messages,[row],[tool]).receipts).toEqual([{id,hash:digest(row)}]);expect(execute).not.toHaveBeenCalled();
});
it.each(['user_id','run_id','call_key','tool_id','tool_version','input_hash','status','effect','approval_id'] as const)('rejects mismatched %s',field=>{
 const {messages,row}=fixture();row[field]='wrong';expect(()=>bindRecordedEvidenceReceipts(context,messages,[row],[tool])).toThrow();
});
it('rejects missing, duplicated, altered input and substituted output',()=>{
 const {messages,row}=fixture();
 expect(()=>bindRecordedEvidenceReceipts(context,messages,[],[tool])).toThrow();
 expect(()=>bindRecordedEvidenceReceipts(context,[...messages,...messages],[row],[tool])).toThrow();
 expect(()=>bindRecordedEvidenceReceipts(context,messages,[{...row,input:{limit:2},input_hash:digest({limit:2})}],[tool])).toThrow();
 expect(()=>bindRecordedEvidenceReceipts(context,messages,[{...row,output:result([],{callId:id})}],[tool])).toThrow();
 messages[1].content=JSON.stringify(result([]));expect(()=>bindRecordedEvidenceReceipts(context,messages,[row],[tool])).toThrow();
});
