import {it,expect} from 'vitest';
import {digest} from './contracts';
import {modeModelConfig} from './mode-config';
import {modelFunctions} from './model';
import {modelRequestManifest} from './model-request-manifest';
import {prepareSkillModelJournalAudit,type SkillModelAuditRow} from './skill-candidate-audit';
const identity={userId:'owner',evaluationId:'evaluation',arm:'candidate' as const};
function fixture():SkillModelAuditRow[]{
 const profile=modeModelConfig('quick').profile!,messages=[{role:'user',content:'Synthetic request'}];
 return [0,1].map(index=>{
  const input={profile,messages,index},route=profile.routes[index];
  const body={model:route.model,messages,tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
  const output=index===0?{status:'unavailable',data:{retryable:true,reason:'timeout-first-output'}}:{status:'success',data:{value:{message:{role:'assistant',content:'Synthetic answer'},requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:'generation'})}}};
  return {id:String(index),owner_id:identity.userId,evaluation_id:identity.evaluationId,arm:identity.arm,step:0,route_index:index,source_kind:'synthetic-fixture',snapshot_hash:digest('snapshot'),input,input_hash:digest(input),output,output_hash:digest(output)};
 });
}
it('validates a complete fallback group and preserves synthetic provenance',()=>{
 const out=prepareSkillModelJournalAudit(identity,fixture());expect(out.sourceKind).toBe('synthetic-fixture');expect(out.selected).toHaveLength(1);expect(out.fallback.attempts).toBe(2);
});
it.each(['empty','missing-outcome','output-hash','input-hash','owner','evaluation','arm','kind','snapshot','duplicate','step-gap','missing-predecessor','failed-final','invalid-failure'])('rejects %s journal',kind=>{
 const rows=fixture();
 if(kind==='empty')rows.length=0;
 if(kind==='missing-outcome'){rows[0].output=null;rows[0].output_hash=null;}
 if(kind==='output-hash')rows[0].output_hash=digest('changed');
 if(kind==='input-hash')rows[0].input_hash=digest('changed');
 if(kind==='owner')rows[0].owner_id='other';if(kind==='evaluation')rows[0].evaluation_id='other';if(kind==='arm')rows[0].arm='baseline';
 if(kind==='kind')rows[0].source_kind='production-runner-pending-verification';if(kind==='snapshot')rows[0].snapshot_hash=digest('other');
 if(kind==='duplicate')rows.push(rows[0]);if(kind==='step-gap')rows.forEach(row=>{row.step=1;});if(kind==='missing-predecessor')rows.shift();
 if(kind==='failed-final'){rows[1].output=rows[0].output;rows[1].output_hash=rows[0].output_hash;}
 if(kind==='invalid-failure'){rows[0].output={status:'unavailable',data:{retryable:true,reason:'execution-cancelled'}};rows[0].output_hash=digest(rows[0].output);}
 expect(()=>prepareSkillModelJournalAudit(identity,rows)).toThrow();
});

it('preserves a uniform freeze binding and rejects mixed or malformed bindings',()=>{
 const rows=fixture(),freezeId='11111111-1111-4111-8111-111111111111';
 rows.forEach(row=>{row.freeze_id=freezeId;});
 expect(prepareSkillModelJournalAudit(identity,rows).freezeId).toBe(freezeId);
 delete rows[0].freeze_id;expect(()=>prepareSkillModelJournalAudit(identity,rows)).toThrow();
 rows.forEach(row=>{row.freeze_id='invalid';});expect(()=>prepareSkillModelJournalAudit(identity,rows)).toThrow();
});
