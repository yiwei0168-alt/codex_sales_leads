import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import type {Pool} from 'pg';
import {checkpointTransactionPool} from './checkpoint-transaction-pool';
import {prepareSkillCandidateCheckpoint,retainCheckpointLease} from './skill-candidate-checkpoint';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';

type Pin=Parameters<typeof prepareSkillCandidateCheckpoint>[1];
const schema='skill_candidate_graph';

/** Candidate storage uses the same installed saver and transaction bridge as
 * ordinary tasks. Collector RLS and private lease/source binding remain separate. */
class SkillCandidateGraphCheckpointer extends PostgresSaver{
 private readonly threadId:string;
 constructor(private readonly transaction:SkillCollectorTransaction,private readonly pin:Pin,
  private readonly token:string,private readonly assertOwned:()=>Promise<void>){
  // All I/O is overridden and delegated to the collector's retained client.
  // No application pool or application credentials are opened by this adapter.
  super({} as Pool,undefined,{schema});
  this.threadId=`skill-candidate:${pin.ownerId}:${pin.evaluationId}:${pin.arm}:${pin.snapshotHash}`;
 }
 configuration(){return {configurable:{thread_id:this.threadId,checkpoint_ns:''}};}
 private assertThread(config:Parameters<PostgresSaver['put']>[0]){
  if(config.configurable?.thread_id!==this.threadId)throw new Error('Candidate graph checkpoint task identity changed');
 }
 private async scoped<T>(work:(saver:PostgresSaver)=>Promise<T>):Promise<T>{
  await this.assertOwned();
  const value=await this.transaction(this.pin.ownerId,async client=>{
   await assertSkillCollector(client);
   const current=async()=>{
    await retainCheckpointLease(client,this.pin,this.token);
    const row=(await client.query(`select 1 from agent_skill_candidate_checkpoint c
     join agent_skill_candidate_execution_lease l using(owner_id,evaluation_id,arm)
     where c.owner_id=$1 and c.evaluation_id=$2 and c.arm=$3 and c.execution_token=$4 and c.snapshot_hash=$5
      and c.source_kind=$6 and c.freeze_id is not distinct from $7::uuid`,
    [this.pin.ownerId,this.pin.evaluationId,this.pin.arm,this.token,this.pin.snapshotHash,this.pin.sourceKind,this.pin.freezeId??null])).rows[0];
    if(!row)throw new Error('Candidate graph checkpoint binding changed');
   };
   await current();const result=await work(new PostgresSaver(checkpointTransactionPool({} as Pool,client),this.serde,{schema}));
   await current();return result;
  });
  await this.assertOwned();return value;
 }
 override async setup(){throw new Error('Candidate graph schema must be installed by migration');}
 override async end(){}
 override async put(...args:Parameters<PostgresSaver['put']>){this.assertThread(args[0]);return this.scoped(saver=>saver.put(...args));}
 override async putWrites(...args:Parameters<PostgresSaver['putWrites']>){this.assertThread(args[0]);return this.scoped(saver=>saver.putWrites(...args));}
 override async getTuple(...args:Parameters<PostgresSaver['getTuple']>){this.assertThread(args[0]);return this.scoped(saver=>saver.getTuple(...args));}
 override async *list(config:Parameters<PostgresSaver['list']>[0],options:Parameters<PostgresSaver['list']>[1]={}){
  this.assertThread(config);if(options.before)this.assertThread(options.before);
  let remaining=options.limit??Infinity,before=options.before;
  while(remaining>0){
   const limit=Math.min(50,remaining);
   const page=await this.scoped(async saver=>{const rows=[];for await(const row of saver.list(config,{...options,before,limit}))rows.push(row);return rows;});
   for(const row of page){await this.assertOwned();yield row;remaining--;}
   if(page.length<limit)return;before=page[page.length-1].config;
  }
 }
 override async deleteThread(threadId:string){this.assertThread({configurable:{thread_id:threadId}});return this.scoped(saver=>saver.deleteThread(threadId));}
}

export async function prepareSkillCandidateGraphCheckpointer(transaction:SkillCollectorTransaction,pin:Pin,token:string,assertOwned:()=>Promise<void>){
 const legacy=await prepareSkillCandidateCheckpoint(transaction,pin,token,assertOwned);
 if(!legacy||await legacy.load())throw new Error('Candidate graph protocol requires a fresh, bound checkpoint');
 const checkpointer=new SkillCandidateGraphCheckpointer(transaction,pin,token,assertOwned);
 return {checkpointer,config:checkpointer.configuration()};
}
