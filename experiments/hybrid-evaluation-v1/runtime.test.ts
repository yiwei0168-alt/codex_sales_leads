import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {once,json,id} from './runtime';
async function removeScratch(directory:string){
 const target=resolve(directory);
 assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('hybrid-receipt-'));
 await rm(target,{recursive:true,force:true});
}

test('successful paid receipt is reused; changed identity cannot make a second call',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'hybrid-receipt-'));let calls=0;
 try{const path=join(directory,'receipt.json');
  const first=await once(path,'same',async()=>{calls++;return {id:'provider-1',cost:0.01};});
  const second=await once(path,'same',async()=>{calls++;return null;});
  assert.deepEqual(second,first);assert.equal(calls,1);
  await assert.rejects(once(path,'changed',async()=>{calls++;}),/identity drift/);assert.equal(calls,1);
 }finally{await removeScratch(directory);}
});
test('transport uncertainty and crash markers block any replay',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'hybrid-receipt-'));let calls=0;
 try{const path=join(directory,'receipt.json');
  const failed=await once(path,'same',async()=>{calls++;throw Error('transport secret must not be logged');});
  assert.equal(failed.status,'unknown');assert.deepEqual(failed.error,{name:'Error'});
  await once(path,'same',async()=>{calls++;});assert.equal(calls,1);
  const interrupted=join(directory,'interrupted.json');
  await writeFile(interrupted,json({identity:'same',status:'started',startedAt:new Date().toISOString()}));
  assert.equal((await once(interrupted,'same',async()=>{calls++;})).status,'started');assert.equal(calls,1);
 }finally{await removeScratch(directory);}
});
test('concurrent exclusive claims invoke the provider at most once',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'hybrid-receipt-'));let calls=0;
 try{const path=join(directory,'receipt.json');
  await Promise.allSettled(Array.from({length:4},()=>once(path,'same',async()=>{calls++;return 'response';})));
  assert.equal(calls,1);assert.match(id('fixture'),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
 }finally{await removeScratch(directory);}
});
