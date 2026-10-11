/* eslint-disable @typescript-eslint/no-require-imports -- Clone-only fault injection. */
const {writeFileSync}=require('node:fs');
const {resolve,sep}=require('node:path');
const {Client}=require('pg');
const db=new URL(process.env.DATABASE_URL),marker=resolve(process.env.TEXT_CRASH_MARKER);
if(!['localhost','127.0.0.1','::1'].includes(db.hostname)||!/^\/ma11_replay_[a-f0-9]{12}$/.test(db.pathname)
 ||!marker.startsWith(resolve('tmp/text-crash')+sep)||process.argv.at(-1)!=='--child')throw new Error('Clone child required');
const query=Client.prototype.query,seen=new WeakSet();
Client.prototype.query=function(sql,...args){
 const text=typeof sql==='string'?sql:sql?.text||'';
 if(/update knowledge_document set current_tree_version_id/.test(text))seen.add(this);
 if(/^commit$/i.test(text.trim())&&seen.has(this)){
  writeFileSync(marker,JSON.stringify({pid:process.pid}),{flag:'wx'});
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);
  throw new Error('Parent failed to terminate child');
 }
 return query.call(this,sql,...args);
};
