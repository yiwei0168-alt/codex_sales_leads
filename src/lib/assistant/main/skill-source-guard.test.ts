import {expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {digest} from './contracts';
import {skillSourcesCurrent,type SourcedSkillVersion} from './skill-source-guard';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(){
  const owner=id(1),quote='I found comparing original tables reduced errors.',memoryKey='tables';
  const fingerprint=digest({version:'experience-draft-v1',memoryKey,quote});
  const rows=[2,3].map(n=>({id:id(n),run_id:id(n+10),message_id:id(n+20),memory_key:memoryKey,content:quote,source_receipt:{n}}));
  const files={'SKILL.md':'Check originals'};
  const version:SourcedSkillVersion={source:`local-experience:${fingerprint}`,scope:'account',owner_id:owner,files,content_hash:digest(files),
    validation:{sourceQuality:'repeated-user-report-unverified',methodFingerprint:fingerprint,sourceObservations:rows.map(r=>({observationId:r.id,runId:r.run_id,messageId:r.message_id,receiptSha256:digest(r.source_receipt)}))}};
  const query=vi.fn(async()=>({rows})),client={query} as unknown as PoolClient;
  return {owner,rows,version,client,query};
}
it('accepts current exact provenance without changing quality status',async()=>{
  const f=fixture();expect(await skillSourcesCurrent(f.client,f.owner,f.version)).toBe(true);
  expect(f.version.validation).not.toHaveProperty('autoEnable');
});
it.each(['missing','receipt','method','run','message'] as const)('rejects %s source drift',async kind=>{
  const f=fixture();
  if(kind==='missing')f.rows.pop();
  if(kind==='receipt')f.rows[0].source_receipt.n=999;
  if(kind==='method')f.rows[0].content='Another method';
  if(kind==='run')f.rows[0].run_id=id(99);
  if(kind==='message')f.rows[0].message_id=id(99);
  expect(await skillSourcesCurrent(f.client,f.owner,f.version)).toBe(false);
});
it.each(['owner','global','files','validation','source'] as const)('fails closed for invalid %s before reading observations',async kind=>{
  const f=fixture();
  if(kind==='owner')f.version.owner_id=id(99);
  if(kind==='global')f.version.scope='global';
  if(kind==='files')f.version.files={'SKILL.md':'Altered'};
  if(kind==='validation')f.version.validation={};
  if(kind==='source')f.version.source='user';
  expect(await skillSourcesCurrent(f.client,f.owner,f.version)).toBe(false);expect(f.query).not.toHaveBeenCalled();
});
it('preserves ordinary imported package behavior',async()=>{
  const f=fixture();f.version.source='user';f.version.validation={};
  expect(await skillSourcesCurrent(f.client,f.owner,f.version)).toBe(true);expect(f.query).not.toHaveBeenCalled();
});
it('rejects duplicated report references',async()=>{
  const f=fixture();const v=f.version.validation as {sourceObservations:unknown[]};v.sourceObservations[1]=v.sourceObservations[0];
  expect(await skillSourcesCurrent(f.client,f.owner,f.version)).toBe(false);
});
