import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runGuardedBatch,PaymentRequiredStop} from './guarded-batch.mjs';
const trace=status=>({wire:[{status}]});
test('first 402 preserves submitted task and prevents subsequent requests',async()=>{
 const submitted=[];
 await assert.rejects(runGuardedBatch(['a','b','c'],{readSaved:async()=>null,submit:async key=>{submitted.push(key);return {trace:trace(key==='b'?402:200)};}}),PaymentRequiredStop);
 assert.deepEqual(submitted,['a','b']);
});
test('saved 402 anywhere stops before submitting earlier missing entries',async()=>{
 let calls=0;
 await assert.rejects(runGuardedBatch(['missing','saved'],{readSaved:async key=>key==='saved'?{trace:trace(402)}:null,submit:async()=>{calls++;}}),PaymentRequiredStop);
 assert.equal(calls,0);
});
test('saved completed result is reused without execution',async()=>{
 const calls=[];
 const result=await runGuardedBatch(['a','b'],{readSaved:async k=>k==='a'?{trace:trace(200)}:null,submit:async k=>{calls.push(k);return {trace:trace(200)};}});
 assert.deepEqual(calls,['b']);assert.deepEqual(result,[{key:'a',reused:true},{key:'b',reused:false}]);
});
test('uncertain submission propagates and never retries',async()=>{
 let calls=0;const failure=new Error('connection lost after dispatch');
 await assert.rejects(runGuardedBatch(['a','b'],{readSaved:async()=>null,submit:async()=>{calls++;throw failure;}}),e=>e===failure);
 assert.equal(calls,1);
});
test('missing saved trace fails closed',async()=>{
 let calls=0;
 await assert.rejects(runGuardedBatch(['a'],{readSaved:async()=>({trace:null}),submit:async()=>{calls++;}}),/Missing wire/);
 assert.equal(calls,0);
});
test('duplicate keys fail before reading or submitting',async()=>{
 await assert.rejects(runGuardedBatch(['a','a'],{readSaved:async()=>{throw Error('must not read');},submit:async()=>{throw Error('must not submit');}}),/Duplicate/);
});
