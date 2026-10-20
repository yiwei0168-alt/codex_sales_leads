import {expect,it,vi} from 'vitest';
import type {SkillCollectorTransaction} from './skill-model-journal';
import {withSkillCandidateExecution} from './skill-candidate-execution';
const pin={ownerId:'11111111-1111-4111-8111-111111111111',evaluationId:'22222222-2222-4222-8222-222222222222',arm:'candidate' as const};
function fixture(){
 const state={role:'network_copilot_skill_collector',owner:pin.ownerId,transaction_id:'12'};let admitted=true;
 const query=vi.fn(async(sql:string)=>sql.includes('pg_roles')?{rows:[{name:state.role,super:false,bypass:false}]}:
  sql.includes('pg_try_advisory')?{rows:[{admitted}]}:{rows:[{...state}]});
 const transaction:SkillCollectorTransaction=async(_owner,work)=>work({query} as never);
 return {state,query,transaction,busy:()=>{admitted=false;}};
}
it('holds and checks one transaction, and closes the guard after callback return',async()=>{
 const f=fixture();let retained:(()=>Promise<void>)|undefined;
 expect(await withSkillCandidateExecution(f.transaction,pin,async check=>{retained=check;await check();return 7;})).toBe(7);
 await expect(retained!()).rejects.toThrow('scope ended');
 expect(f.query.mock.calls.filter(([sql])=>sql.includes('pg_try_advisory'))).toHaveLength(1);
});
it('uses the separate execution channel while keeping the journal channel free',async()=>{
 const f=fixture(),journal=vi.fn(async()=>{throw new Error('Journal pool must remain free');}) as unknown as SkillCollectorTransaction;
 journal.execution=f.transaction;
 expect(await withSkillCandidateExecution(journal,pin,async()=>true)).toBe(true);expect(journal).not.toHaveBeenCalled();
});
it('rejects a concurrent owner before entering the callback',async()=>{
 const f=fixture();f.busy();const work=vi.fn();
 await expect(withSkillCandidateExecution(f.transaction,pin,work)).rejects.toThrow('already owned');expect(work).not.toHaveBeenCalled();
});
it.each(['role','owner','transaction_id'] as const)('rejects changed %s after work and closes retained guards',async key=>{
 const f=fixture();let retained:(()=>Promise<void>)|undefined;
 await expect(withSkillCandidateExecution(f.transaction,pin,async check=>{retained=check;f.state[key]='changed';})).rejects.toThrow('ownership changed');
 await expect(retained!()).rejects.toThrow('scope ended');
});
it('rejects an unexpected owner before work',async()=>{
 const f=fixture();f.state.owner='other';const work=vi.fn();
 await expect(withSkillCandidateExecution(f.transaction,pin,work)).rejects.toThrow('context unavailable');expect(work).not.toHaveBeenCalled();
});
