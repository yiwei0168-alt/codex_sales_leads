import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BatchStopped,runControlledBatch,fileStopRequested,hasTransportFailure} from './controlled-batch.mjs';
const good={wire:[{status:200}],calls:[]},bad={wire:[{error:'transport-failure'}],calls:[]};
const base={readSaved:async()=>null,stopRequested:async()=>false};
test('a stop received during a task drains and persists it before preventing the next submission',async()=>{
 let stopped=false,persisted=false;const submissions=[];
 await assert.rejects(runControlledBatch(['a','b'],{...base,stopRequested:async()=>stopped,submit:async key=>{
  submissions.push(key);stopped=true;await new Promise(r=>setTimeout(r,5));persisted=true;return {trace:good};
 }}),e=>e instanceof BatchStopped&&e.reason==='operator-stop'&&e.completed[0].key==='a');
 assert.equal(persisted,true);assert.deepEqual(submissions,['a']);
});
test('two consecutive network failures stop before a third task without deleting failures',async()=>{
 const submissions=[];
 await assert.rejects(runControlledBatch(['a','b','c'],{...base,submit:async key=>{submissions.push(key);return {trace:bad};}}),
 e=>e instanceof BatchStopped&&e.reason==='consecutive-transport-failures'&&e.completed.length===2);
 assert.deepEqual(submissions,['a','b']);
});
test('a successful task resets the consecutive counter and prior claims are not rerun',async()=>{
 const submissions=[];
 const result=await runControlledBatch(['a','b','c','d'],{...base,readSaved:async key=>key==='a'?{trace:bad}:null,
 submit:async key=>{submissions.push(key);return {trace:key==='c'?bad:good};}});
 assert.deepEqual(submissions,['b','c','d']);assert.equal(result[0].reused,true);
});
test('stream failures with HTTP 200 count, but correct reads and bare unknown amounts are not invented transport errors',()=>{
 assert.equal(Boolean(hasTransportFailure({wire:[{status:200}],calls:[{tool_id:'main_model',output:{status:'unavailable'},metrics:{failureDiagnostic:{transport:{phase:'response-stream'}}}}]})),true);
 assert.equal(Boolean(hasTransportFailure(good)),false);
 assert.equal(Boolean(hasTransportFailure({wire:[{status:200}],billing:[{reported_micros:null}]})),false);
});
test('a pre-existing stop prevents all provider submissions',async()=>{
 let n=0;await assert.rejects(runControlledBatch(['a'],{...base,stopRequested:async()=>true,submit:async()=>{n++;}}),BatchStopped);assert.equal(n,0);
});
test('stop file existence is independent of frozen source; read errors propagate',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'hybrid-stop-')),path=join(directory,'STOP');
 try{assert.equal(await fileStopRequested(path),false);await writeFile(path,'operator stop');assert.equal(await fileStopRequested(path),true);
 await assert.rejects(fileStopRequested(123),TypeError);
 }finally{await rm(path,{force:true});await rmdir(directory);}
});
