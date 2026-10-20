import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({check:vi.fn(),query:vi.fn()}));
vi.mock('./memory-message-guard',()=>({assertCurrentMemoryMessages:m.check}));
import {revalidateLockedSkillMemoryReceipts as check} from './skill-memory-receipt-check';
const owner=randomUUID(),client={query:m.query} as unknown as PoolClient,clock=new Date('2026-10-19T01:02:03.000Z');
const receipt=(tool:string,input:unknown={})=>({tool,input,output:{status:'success',data:[]}});
beforeEach(()=>{vi.resetAllMocks();m.query.mockResolvedValue({rows:[{checked_at:clock,valid_before:null}]});m.check.mockResolvedValue(undefined);});
it('binds all three memory read tools to one current database clock',async()=>{
 const receipts=[receipt('memory_read'),receipt('memory_history_search',{query:'history'}),receipt('memory_observation_search',{query:'observed'})];
 expect(await check(client,owner,receipts)).toMatchObject({memoryReceiptSourcesRevalidated:true,memoryReceiptCount:3,memoryReceiptCheckedAt:clock.toISOString(),memoryTimeFenceRevalidated:true,memoryTimeValidBefore:null});
 expect(m.query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('boundaries as'),[owner,true,true]);
 const messages=m.check.mock.calls[0][1];expect(messages).toHaveLength(6);
 expect(messages[1].tool_call_id).toBe(messages[0].tool_calls[0].id);
 expect(m.check).toHaveBeenCalledWith(owner,expect.any(Array),clock.toISOString());
});
it('preserves explicit as-of query arguments unchanged',async()=>{
 const input={query:'past',businessAt:'2020-01-01T00:00:00.000Z',knownAt:'2021-01-01T00:00:00.000Z'};
 await check(client,owner,[receipt('memory_observation_search',input)]);
 expect(JSON.parse(m.check.mock.calls[0][1][0].tool_calls[0].function.arguments).arguments).toEqual(input);
});
it('does not parse or expose unrelated evidence domains',async()=>{
 expect(await check(client,owner,[receipt('mail_read',{private:'omitted'})])).toMatchObject({memoryReceiptCount:0});
 expect(m.check).toHaveBeenCalledWith(owner,[],clock.toISOString());
});
it('propagates revoked memory rather than returning a partial pass',async()=>{
 m.check.mockRejectedValue(new Error('Memory context validation failed'));
 await expect(check(client,owner,[receipt('memory_read')])).rejects.toThrow('Memory context validation failed');
});
it.each([{}, {checked_at:new Date('invalid')},{checked_at:clock.toISOString()}])('rejects an invalid database time %j',async row=>{
 m.query.mockResolvedValue({rows:[row]});await expect(check(client,owner,[])).rejects.toThrow('time fence unavailable');expect(m.check).not.toHaveBeenCalled();
});
it('rejects unresolved memory outputs before current-source access',async()=>{
 await expect(check(client,owner,[{...receipt('memory_read'),output:{status:'unavailable',data:[]}}])).rejects.toThrow();
 expect(m.query).not.toHaveBeenCalled();expect(m.check).not.toHaveBeenCalled();
});
