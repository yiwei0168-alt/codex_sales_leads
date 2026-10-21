import type {Pool,PoolClient} from 'pg';

/** Keep the installed PostgresSaver's serialization and SQL on the caller's
 * transaction. Only that caller may commit, roll back or release the client. */
export function checkpointTransactionPool(pool:Pool,client:PoolClient):Pool{
 const scopedClient=new Proxy(client,{get(target,key){
  if(key==='release')return ()=>{};
  if(key==='query')return (...args:unknown[])=>{
   if(typeof args[0]==='string'&&['BEGIN','COMMIT','ROLLBACK'].includes(args[0].trim().toUpperCase()))
    return Promise.resolve({rows:[],rowCount:0,command:'',fields:[],oid:0});
   return Reflect.apply(target.query,target,args);
  };
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 return new Proxy(pool,{get(target,key){
  if(key==='connect')return async(...args:unknown[])=>{if(args.length)throw new Error('Checkpoint connection callbacks unavailable');return scopedClient;};
  if(key==='query')return (...args:unknown[])=>Reflect.apply(client.query,client,args);
  if(key==='end')return async()=>{throw new Error('Checkpoint adapter does not own the pool');};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
