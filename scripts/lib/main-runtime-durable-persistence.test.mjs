import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FileSystemPersistence,serialize,deserialize} from '../../node_modules/@langchain/langgraph-api/dist/storage/persist.mjs';
import {installDurablePersistence} from './main-runtime-durable-persistence.mjs';

installDurablePersistence({FileSystemPersistence,serialize,deserialize});
async function fixture(work){
 const directory=await mkdtemp(join(tmpdir(),'ma24-durable-state-'));
 try{await work(directory);}finally{await rm(directory,{recursive:true,force:true});}
}
test('acknowledged changes are on disk and reload without graceful shutdown',()=>fixture(async directory=>{
 const store=await new FileSystemPersistence('ops',()=>({threads:{}})).initialize(directory);
 await store.with(data=>{data.threads.a={marker:'acknowledged'};});
 const fresh=await new FileSystemPersistence('ops',()=>({threads:{}})).initialize(directory);
 assert.deepEqual(fresh.data,{threads:{a:{marker:'acknowledged'}}});
 assert.deepEqual(await readdir(join(directory,'.langgraph_api')),['ops']);
}));
test('corrupt existing state rejects startup and preserves its bytes',()=>fixture(async directory=>{
 const root=join(directory,'.langgraph_api');await mkdir(root);
 await writeFile(join(root,'ops'),'broken snapshot');
 await assert.rejects(new FileSystemPersistence('ops',()=>({})).initialize(directory));
 assert.equal(await readFile(join(root,'ops'),'utf8'),'broken snapshot');
}));
test('queued snapshots retain the last acknowledged write',()=>fixture(async directory=>{
 const store=await new FileSystemPersistence('ops',()=>({value:0})).initialize(directory);
 await Promise.all(Array.from({length:12},(_,value)=>store.with(data=>{data.value=value;})));
 assert.equal((await deserialize(await readFile(store.filepath,'utf8'))).value,11);
}));
test('failed replacement rejects writes and subsequent callbacks fail closed',()=>fixture(async directory=>{
 const store=await new FileSystemPersistence('ops',()=>({value:0})).initialize(directory);
 await store.with(data=>{data.value=1;});const original=store.filepath;
 const blocked=join(directory,'.langgraph_api','directory');await mkdir(blocked);store.filepath=blocked;
 await assert.rejects(store.with(data=>{data.value=2;}));store.filepath=original;
 let invoked=false;await assert.rejects(store.with(()=>{invoked=true;}));assert.equal(invoked,false);
 assert.equal((await deserialize(await readFile(original,'utf8'))).value,1);
 assert((await readdir(join(directory,'.langgraph_api'))).every(name=>!name.includes('.pending-')));
}));
test('dirty generator completion persists before completion is acknowledged',()=>fixture(async directory=>{
 const store=await new FileSystemPersistence('ops',()=>({value:0})).initialize(directory);
 const values=[];for await(const value of store.withGenerator(async function*(data,{schedulePersist}){
  data.value=7;schedulePersist();yield 'item';
 }))values.push(value);
 assert.deepEqual(values,['item']);assert.equal((await deserialize(await readFile(store.filepath,'utf8'))).value,7);
}));
