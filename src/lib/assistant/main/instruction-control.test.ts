import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({tx:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:m.tx,tenantQuery:m.query,query:vi.fn()}));
import {controlRun,readInstructionSubmission} from './repository';
import {runControlSchema} from './run-control';
const key='11111111-abcd-4111-8111-111111111111';
let row:Record<string,unknown>,statements:Array<{sql:string;args:unknown[]}>;
beforeEach(()=>{vi.resetAllMocks();row={status:'paused',execution_kind:'main-agent',instructions:[]};statements=[];m.tx.mockImplementation(async(_user:string,work:(client:unknown)=>unknown)=>work({query:async(sql:string,args:unknown[])=>{statements.push({sql,args});return {rows:sql.startsWith('select *')?[row]:[],rowCount:1};}}));});
it('binds one normalized identity to an exact instruction and one event',async()=>{
 expect(await controlRun('owner','run','instruct','  generated body  ',key.toUpperCase())).toBe(true);
 expect(statements[0]).toEqual({sql:expect.stringContaining('user_id=$1 and id=$2 for update'),args:['owner','run']});
 expect(JSON.parse(String(statements[1].args[2]))).toEqual([{id:key,content:'generated body'}]);expect(JSON.parse(String(statements[2].args[2]))).toEqual({action:'instruct',instructionId:key});
});
it.each(['paused','running','completed','cancelled'])('acknowledges the same saved instruction without any mutation when %s',async status=>{
 row={...row,status,instructions:[{id:key,content:'generated body'}]};expect(await controlRun('owner','run','instruct',' generated body ',key.toUpperCase())).toBe(true);expect(statements).toHaveLength(1);
});
it('refuses changed content and ambiguous identities before any write',async()=>{
 row.instructions=[{id:key,content:'first'}];await expect(controlRun('owner','run','instruct','second',key)).rejects.toThrow('different content');expect(statements).toHaveLength(1);
 statements=[];row.instructions=[{id:key,content:'first'},{id:key,content:'first'}];await expect(controlRun('owner','run','instruct','first',key)).rejects.toThrow('different content');expect(statements).toHaveLength(1);
});
it('never bypasses evaluation or terminal new-work restrictions',async()=>{
 row={...row,execution_kind:'main-agent-evaluation',instructions:[{id:key,content:'first'}]};await expect(controlRun('owner','run','instruct','first',key)).rejects.toThrow('only be cancelled');
 row={...row,execution_kind:'main-agent',status:'completed',instructions:[]};await expect(controlRun('owner','run','instruct','new',key)).rejects.toThrow('terminal');
});
it('retains legacy callers and disallows identities on unrelated controls',async()=>{
 expect(await controlRun('owner','run','instruct',' legacy ')).toBe(true);expect(JSON.parse(String(statements[1].args[2]))[0]).toEqual({id:expect.any(String),content:' legacy '});
 await expect(controlRun('owner','run','resume',undefined,key)).rejects.toThrow('only for instructions');
 expect(runControlSchema.safeParse({action:'instruct',requestKey:key}).success).toBe(false);expect(runControlSchema.safeParse({action:'resume',requestKey:key}).success).toBe(false);expect(runControlSchema.safeParse({action:'instruct',content:'text',requestKey:key,userId:'other'}).success).toBe(false);
});
it('reads only the owner task and distinguishes terminal absence from a recorded receipt',async()=>{
 m.query.mockResolvedValue([{status:'completed',instructions:[{id:key,content:'private generated'}]}]);expect(await readInstructionSubmission('owner','run',key.toUpperCase())).toEqual({recorded:true,content:'private generated'});
 expect(m.query).toHaveBeenCalledWith('owner',expect.stringContaining("execution_kind<>'main-agent-evaluation'"),['owner','run']);m.query.mockResolvedValue([{status:'cancelled',instructions:[]}]);expect(await readInstructionSubmission('owner','run',key)).toEqual({recorded:false,terminal:true});m.query.mockResolvedValue([]);expect(await readInstructionSubmission('peer','run',key)).toBeNull();
});
