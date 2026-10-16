import type {PoolClient} from 'pg';
import {expect,it,vi} from 'vitest';
import {skillAcceptanceRunIds,skillAcceptanceAttachmentIds,skillAcceptanceMailIds,skillAcceptanceTimelineSelection,skillAcceptanceProspectiveBindings,lockSkillAcceptanceRunJournals} from './skill-acceptance-run-locks';
const runId='00000000-0000-4000-8000-000000000001';
const artifact={plan:{cases:[{id:'replay',provenance:'historical-task'},{id:'shadow',provenance:'prospective-task'},{id:'safe',provenance:'safety-fixture'}]},
 rawReceipts:{baselineSources:{replay:{runId}},candidateSources:{replay:{runId}},prospectiveSources:{shadow:{runId,jobId:runId}},safetySources:{safe:{runId}}}};
it('derives and deduplicates runs across all stored source families',()=>{
 expect(skillAcceptanceRunIds(artifact)).toEqual([runId]);
});
it('rejects a historical candidate bound to a different run',()=>{
 expect(()=>skillAcceptanceRunIds({...artifact,rawReceipts:{...artifact.rawReceipts,candidateSources:{replay:{runId:'00000000-0000-4000-8000-000000000002'}}}})).toThrow('arm sources differ');
});
it('rejects missing references and unsupported provenance',()=>{
 expect(()=>skillAcceptanceRunIds({...artifact,rawReceipts:{}})).toThrow();
 expect(()=>skillAcceptanceRunIds({...artifact,plan:{cases:[{id:'x',provenance:'invented'}]}})).toThrow('Unsupported');
 expect(()=>skillAcceptanceRunIds({...artifact,plan:{cases:[]}})).toThrow();
});
it('fails closed before task and journal queries if origin lock count differs',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{n:0}]});
 await expect(lockSkillAcceptanceRunJournals({query} as unknown as PoolClient,runId,artifact)).rejects.toThrow('origin lock incomplete');
 expect(query).toHaveBeenCalledTimes(1);
});
it('propagates missing origin migration before reading any journal',async()=>{
 const query=vi.fn().mockRejectedValue(new Error('function lock_skill_task_origins does not exist'));
 await expect(lockSkillAcceptanceRunJournals({query} as unknown as PoolClient,runId,artifact)).rejects.toThrow('does not exist');
 expect(query).toHaveBeenCalledTimes(1);
});
it('derives only valid stored attachments, deduplicated and sorted',()=>{
 expect(skillAcceptanceAttachmentIds([{input:{}},{input:{content:'Normal task',mode:'standard',requestKey:'request-key',attachments:[{assetId:runId},{assetId:runId}]}}])).toEqual([runId]);
 expect(()=>skillAcceptanceAttachmentIds([{input:{attachments:[{assetId:'invalid'}]}}])).toThrow();
});
it('derives mail IDs only from valid stored mail read inputs',()=>{
 expect(skillAcceptanceMailIds([{tool_id:'mail_read',input:{messageId:runId}},{tool_id:'mail_read',input:{messageId:runId}},
  {tool_id:'synthetic',input:{messageId:'ignored'}}])).toEqual([runId]);
 expect(()=>skillAcceptanceMailIds([{tool_id:'mail_read',input:{messageId:'invalid'}}])).toThrow();
});
it('rejects an unavailable or foreign mail row before returning lock success',async()=>{
 const query=vi.fn().mockResolvedValueOnce({rows:[{n:1}]}).mockResolvedValueOnce({rows:[{id:runId,input:{}}]})
  .mockResolvedValueOnce({rows:[{tool_id:'mail_read',input:{messageId:runId}}]}).mockResolvedValueOnce({rows:[]});
 await expect(lockSkillAcceptanceRunJournals({query} as unknown as PoolClient,runId,artifact)).rejects.toThrow('mail source unavailable');
});
it('protects whole account lists alongside explicit customer references',()=>{
 expect(skillAcceptanceTimelineSelection([{tool_id:'customer_timeline',input:{customerId:runId,offset:20}},
  {tool_id:'customer_timeline',input:{country:'CN'}}])).toEqual({customerIds:[runId],includeAll:true});
 expect(skillAcceptanceTimelineSelection([])).toEqual({customerIds:[],includeAll:false});
 expect(()=>skillAcceptanceTimelineSelection([{tool_id:'customer_timeline',input:{customerId:'invalid'}}])).toThrow();
});
it('rejects incomplete timeline locks before returning source success',async()=>{
 const query=vi.fn().mockResolvedValueOnce({rows:[{n:1}]}).mockResolvedValueOnce({rows:[{id:runId,input:{}}]})
  .mockResolvedValueOnce({rows:[{tool_id:'customer_timeline',input:{customerId:runId}}]}).mockResolvedValueOnce({rows:[{n:0}]});
 await expect(lockSkillAcceptanceRunJournals({query} as unknown as PoolClient,runId,artifact)).rejects.toThrow('timeline source lock incomplete');
});
it('batches explicit timeline references before protecting whole-account lists',async()=>{
 const customerIds=Array.from({length:101},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 const query=vi.fn().mockResolvedValueOnce({rows:[{n:1}]}).mockResolvedValueOnce({rows:[{id:runId,input:{}}]})
  .mockResolvedValueOnce({rows:[...customerIds.map(customerId=>({tool_id:'customer_timeline',input:{customerId}})),{tool_id:'customer_timeline',input:{}}]})
  .mockResolvedValueOnce({rows:[{n:100}]}).mockResolvedValueOnce({rows:[{n:1}]}).mockResolvedValueOnce({rows:[{n:102}]}).mockResolvedValueOnce({rows:[{n:1}]});
 expect(await lockSkillAcceptanceRunJournals({query} as unknown as PoolClient,runId,artifact)).toMatchObject({timelineSourcesLocked:true,timelineCustomerCount:102});
 expect(query.mock.calls[3][1]).toEqual([customerIds.slice(0,100),false]);
 expect(query.mock.calls[4][1]).toEqual([customerIds.slice(100),false]);
 expect(query.mock.calls[5][1]).toEqual([[],true]);
});
it('derives capture/run pairs only from stored prospective references',()=>{
 expect(skillAcceptanceProspectiveBindings(artifact)).toEqual([{jobId:runId,runId}]);
 expect(()=>skillAcceptanceProspectiveBindings({...artifact,rawReceipts:{prospectiveSources:{shadow:{runId}}}})).toThrow();
 const duplicated={...artifact,plan:{cases:[{id:'shadow',provenance:'prospective-task'},{id:'other',provenance:'prospective-task'}]},rawReceipts:{prospectiveSources:{shadow:{jobId:runId,runId},other:{jobId:runId,runId:'00000000-0000-4000-8000-000000000002'}}}};
 expect(()=>skillAcceptanceProspectiveBindings(duplicated)).toThrow('binding differs');
});
it('rejects incomplete prospective locks instead of reporting source protection',async()=>{
 const query=vi.fn().mockResolvedValueOnce({rows:[{n:1}]}).mockResolvedValueOnce({rows:[{id:runId,input:{}}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{n:0}]});
 await expect(lockSkillAcceptanceRunJournals({query} as unknown as PoolClient,runId,artifact)).rejects.toThrow('prospective source lock incomplete');
 expect(query.mock.calls[3][1]).toEqual([[runId],[runId]]);
});
it('fails closed if an attachment lock count differs',async()=>{
 const query=vi.fn().mockResolvedValueOnce({rows:[{n:1}]}).mockResolvedValueOnce({rows:[{id:runId,input:{attachments:[{assetId:runId}]}}]})
  .mockResolvedValueOnce({rows:[{n:0}]});
 await expect(lockSkillAcceptanceRunJournals({query} as unknown as PoolClient,runId,artifact)).rejects.toThrow('attachment source lock incomplete');
 expect(query).toHaveBeenCalledTimes(3);
});
it('batches more than 100 unique attachments without dropping any',async()=>{
 const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const taskIds=Array.from({length:6},(_,i)=>uuid(i+1));
 const bundle={plan:{cases:taskIds.map((_,i)=>({id:String(i),provenance:'safety-fixture'}))},
  rawReceipts:{safetySources:Object.fromEntries(taskIds.map((id,i)=>[String(i),{runId:id}]))}};
 const rows=taskIds.map((id,i)=>({id,input:{attachments:Array.from({length:20},(_,j)=>({assetId:uuid(100+i*20+j)}))}}));
 const query=vi.fn().mockResolvedValueOnce({rows:[{n:6}]}).mockResolvedValueOnce({rows})
  .mockResolvedValueOnce({rows:[{n:100}]}).mockResolvedValueOnce({rows:[{n:20}]}).mockResolvedValueOnce({rows:[]});
 expect(await lockSkillAcceptanceRunJournals({query} as unknown as PoolClient,runId,bundle)).toMatchObject({attachmentMetadataLocked:true,attachmentCount:120});
 expect(query.mock.calls[2][1][0]).toHaveLength(100);expect(query.mock.calls[3][1][0]).toHaveLength(20);
});
