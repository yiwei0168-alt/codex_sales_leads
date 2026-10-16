import {EventEmitter} from 'node:events';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
type ClientDouble=EventEmitter&{query:ReturnType<typeof vi.fn>;release:ReturnType<typeof vi.fn>};
type PoolDouble=EventEmitter&{connect:ReturnType<typeof vi.fn>};
const m=vi.hoisted(()=>({pool:undefined as unknown as PoolDouble,client:undefined as unknown as ClientDouble}));
vi.mock('pg',()=>({Pool:vi.fn(function(){return m.pool;})}));
vi.mock('./config',()=>({getRagConfig:()=>({databaseUrl:'postgresql://synthetic@127.0.0.1/test'})}));
import {getPool,transaction} from './db';

beforeEach(()=>{
 globalThis.__networkCopilotPool=undefined;
 globalThis.__networkCopilotDatabaseSecurity=Promise.resolve();
 m.client=Object.assign(new EventEmitter(),{query:vi.fn(async()=>({rows:[]})),release:vi.fn()});
 m.pool=Object.assign(new EventEmitter(),{connect:vi.fn(async()=>m.client)});
});
afterEach(()=>{globalThis.__networkCopilotPool=undefined;globalThis.__networkCopilotDatabaseSecurity=undefined;vi.restoreAllMocks();});

it('handles idle pool errors, invalidates security cache and logs only bounded SQLSTATE',()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined),pool=getPool();
 pool.emit('error',Object.assign(Error('PRIVATE CONNECTION STRING'),{code:'57P01'}));
 expect(globalThis.__networkCopilotDatabaseSecurity).toBeUndefined();
 expect(getPool()).toBe(pool);
 expect(warn).toHaveBeenCalledWith('[database] Idle PostgreSQL connection closed',{code:'57P01'});
 expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE');
 pool.emit('error',Object.assign(Error('PRIVATE SQL'),{code:'PRIVATE_CONNECTION_STRING'}));
 expect(warn).toHaveBeenLastCalledWith('[database] Idle PostgreSQL connection closed',{code:'unknown'});
});
it('commits once and removes the checked-out error listener on release',async()=>{
 let executions=0;
 expect(await transaction(async()=>{executions++;expect(m.client.listenerCount('error')).toBe(1);return 'ok';})).toBe('ok');
 expect(executions).toBe(1);expect(m.client.release).toHaveBeenCalledExactlyOnceWith(false);
 expect(m.client.listenerCount('error')).toBe(0);
 expect(m.client.query.mock.calls.map(row=>row[0])).toEqual(['begin','set local role "network_copilot_app"','commit']);
});
it('preserves the operation error when rollback fails and discards the connection without retry',async()=>{
 const original=Object.assign(Error('original operation failed'),{code:'57P01'}),rollback=Error('rollback failed');
 m.client.query.mockImplementation(async(sql:string)=>{if(sql==='rollback')throw rollback;return {rows:[]};});
 let executions=0;
 await expect(transaction(async()=>{executions++;throw original;})).rejects.toBe(original);
 expect(executions).toBe(1);expect(m.client.release).toHaveBeenCalledExactlyOnceWith(true);
 expect(globalThis.__networkCopilotDatabaseSecurity).toBeUndefined();
});
it('rejects an asynchronous checked-out disconnect before commit and never retries the callback',async()=>{
 const original=Object.assign(Error('connection ended between statements'),{code:'57P01'});let executions=0;
 await expect(transaction(async()=>{executions++;m.client.emit('error',original);return 'must not commit';})).rejects.toBe(original);
 expect(executions).toBe(1);expect(m.client.release).toHaveBeenCalledExactlyOnceWith(true);
 expect(m.client.query.mock.calls.some(row=>row[0]==='commit')).toBe(false);
 expect(m.client.listenerCount('error')).toBe(0);
});
it('rolls back ordinary failures while keeping a healthy connection reusable',async()=>{
 const original=Object.assign(Error('duplicate key'),{code:'23505'}),security=globalThis.__networkCopilotDatabaseSecurity;
 await expect(transaction(async()=>{throw original;})).rejects.toBe(original);
 expect(m.client.release).toHaveBeenCalledExactlyOnceWith(false);
 expect(globalThis.__networkCopilotDatabaseSecurity).toBe(security);
});
