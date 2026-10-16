import {EventEmitter} from 'node:events';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
type ClientDouble=EventEmitter&{query:ReturnType<typeof vi.fn>;release:ReturnType<typeof vi.fn>};
type PoolDouble=EventEmitter&{connect:ReturnType<typeof vi.fn>};
const m=vi.hoisted(()=>({pool:undefined as unknown as PoolDouble,client:undefined as unknown as ClientDouble}));
vi.mock('pg',()=>({Pool:vi.fn(function(){return m.pool;})}));
vi.mock('./config',()=>({getRagConfig:()=>({databaseUrl:'postgresql://synthetic@127.0.0.1/test'})}));
import {getPool,transaction,tenantTransaction,tenantQuery,withBoundTenantTransaction} from './db';
import type {PoolClient} from 'pg';

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
function boundClient(){
 const state={user_id:'owner',role:'member',database_role:'network_copilot_app',transaction_id:'1'};
 m.client.query.mockImplementation(async(sql:string)=>({rows:sql.includes('pg_current_xact_id()')?[{...state}]:[{value:1}]}));
 return {state,client:m.client as unknown as PoolClient};
}
it('reuses the open tenant client without another connection, BEGIN or COMMIT',async()=>{
 const {client}=boundClient();
 await withBoundTenantTransaction(client,'owner',async()=>{
  await tenantTransaction('owner',async nested=>{expect(nested).toBe(client);});
  expect(await tenantQuery('owner','select 1 as value')).toEqual([{value:1}]);
 });
 expect(m.pool.connect).not.toHaveBeenCalled();
 expect(m.client.query.mock.calls.some(([sql])=>['begin','commit','rollback'].includes(sql))).toBe(false);
});
it('rejects owner switches, role switches and unscoped nested transactions',async()=>{
 const {client}=boundClient();
 await withBoundTenantTransaction(client,'owner',async()=>{
  await expect(tenantTransaction('other',async()=>{})).rejects.toThrow('account or role changed');
  await expect(tenantTransaction('owner',async()=>{},'admin')).rejects.toThrow('account or role changed');
  await expect(transaction(async()=>{})).rejects.toThrow('Unscoped transaction');
 });
});
it('rejects autocommit clients before invoking work',async()=>{
 const {client,state}=boundClient();let counter=0;
 m.client.query.mockImplementation(async()=>({rows:[{...state,transaction_id:String(++counter)}]}));
 const work=vi.fn();await expect(withBoundTenantTransaction(client,'owner',work)).rejects.toThrow('identity changed');expect(work).not.toHaveBeenCalled();
});
it('rejects session identity drift and does not swallow callback failures',async()=>{
 const {client,state}=boundClient();
 await expect(withBoundTenantTransaction(client,'owner',async()=>{state.user_id='other';})).rejects.toThrow('identity changed');
 state.user_id='owner';const original=Error('original');
 await expect(withBoundTenantTransaction(client,'owner',async()=>{throw original;})).rejects.toBe(original);
});
it('rejects escaped async descendants after the bound scope ends',async()=>{
 const {client}=boundClient();let resume!:()=>void,late!:Promise<unknown>;
 const wait=new Promise<void>(resolve=>{resume=resolve;});
 await withBoundTenantTransaction(client,'owner',async()=>{late=wait.then(()=>tenantQuery('owner','select 1'));});
 resume();await expect(late).rejects.toThrow('scope ended');
});
it('rejects an initial tenant or database-role mismatch before work',async()=>{
 const {client,state}=boundClient(),work=vi.fn();
 await expect(withBoundTenantTransaction(client,'other',work)).rejects.toThrow('account or role invalid');
 state.database_role='postgres';await expect(withBoundTenantTransaction(client,'owner',work)).rejects.toThrow('account or role invalid');
 expect(work).not.toHaveBeenCalled();
});
