import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {modelFunctions,transportMessages} from './model';
import {modelRequestManifest} from './model-request-manifest';
import {modeModelConfig} from './mode-config';
const db=vi.hoisted(()=>({row:null as Record<string,unknown>|null,query:vi.fn(),owners:[] as string[]}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:async(owner:string,run:(client:unknown)=>Promise<unknown>)=>{db.owners.push(owner);return run({query:db.query});}}));
import {loadRecordedModeRequest,revalidateRecordedModeRequest} from './model-request-source';
const owner='00000000-0000-4000-8000-000000000001',runId='00000000-0000-4000-8000-000000000002',callId='00000000-0000-4000-8000-000000000003';
const context={userId:owner},selection={runId,callId};
beforeEach(()=>{
 const profile=modeModelConfig('standard').profile!,messages=[{role:'user' as const,content:'Synthetic task'}],input={profile,index:0,messages};
 const body={model:profile.routes[0].model,messages:transportMessages(messages),tools:modelFunctions,stream:true,reasoning:{effort:profile.routes[0].effort}};
 db.row={id:callId,user_id:owner,run_id:runId,tool_id:'main_model',tool_version:'1',effect:'model',status:'completed',input,input_hash:digest(input),
  output:{status:'success',data:{value:{requestManifest:modelRequestManifest(body,{model:body.model,provider:'fixture',id:'generation'})}}},
  run_input:{content:'Synthetic task'},run_instructions:[],run_result:{reply:'Saved'},run_model_config:{profile},run_status:'completed',execution_kind:'main-agent',account_role:'member',account_status:'active',run_updated_at:'2026-10-11'};
 db.query.mockReset();db.query.mockImplementation(async()=>({rows:db.row?[structuredClone(db.row)]:[]}));db.owners=[];
});
it('loads exact account/run/call and grants only database provenance',async()=>{
 const value=await loadRecordedModeRequest(context,selection);
 expect(db.owners).toEqual([owner]);expect(db.query.mock.calls[0][1]).toEqual([callId,runId,owner]);
 expect(db.query.mock.calls[0][0]).toContain('c.user_id=$3 and r.user_id=$3');
 expect(value).toMatchObject({serverProvenanceVerified:true,sourcePermissionsRevalidated:false,executionAuthorized:false,qualityAccepted:false});
 expect((await revalidateRecordedModeRequest(context,selection,value.sourceHash)).sourceHash).toBe(value.sourceHash);
});
it.each([['user_id','other'],['run_id','other'],['id','other'],['status','running'],['run_status','running'],['account_status','disabled'],['effect','read'],['tool_id','mail_read'],['tool_version',''],['execution_kind','other']])('rejects mismatched %s',async(field,value)=>{
 db.row![field]=value;await expect(loadRecordedModeRequest(context,selection)).rejects.toThrow('unavailable');
});
it('rejects missing rows and input hash tampering',async()=>{
 db.row!.input_hash='0'.repeat(64);await expect(loadRecordedModeRequest(context,selection)).rejects.toThrow();
 db.row=null;await expect(loadRecordedModeRequest(context,selection)).rejects.toThrow('unavailable');
});
it.each(['run_input','run_instructions','run_result','run_model_config','run_updated_at'])('revalidates changes to %s',async field=>{
 const first=await loadRecordedModeRequest(context,selection);db.row![field]=field==='run_input'?{content:'changed'}:'changed';
 await expect(revalidateRecordedModeRequest(context,selection,first.sourceHash)).rejects.toThrow('source changed');
});
it('does not allow a caller-supplied owner inside the selection',async()=>{
 await expect(loadRecordedModeRequest(context,{...selection,ownerId:owner} as typeof selection)).rejects.toThrow();expect(db.query).not.toHaveBeenCalled();
});

it('binds the current account role to the source snapshot',async()=>{
 const first=await loadRecordedModeRequest(context,selection);expect(first.accountRole).toBe('member');
 db.row!.account_role='admin';
 await expect(revalidateRecordedModeRequest(context,selection,first.sourceHash)).rejects.toThrow('source changed');
});
