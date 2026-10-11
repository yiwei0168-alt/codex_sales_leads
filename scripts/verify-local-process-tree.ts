import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {runBoundedLocalProcess} from './lib/run-bounded-local-process';

const folder=await mkdtemp(resolve('tmp/process-tree-'));
assert(folder.startsWith(resolve('tmp')+sep));
try{
 await runBoundedLocalProcess(process.execPath,['-e','process.exit(0)'],5000);
 await assert.rejects(()=>runBoundedLocalProcess(process.execPath,['-e','process.exit(7)'],5000),/failed: 7/);
 const script=resolve(folder,'tree.py');
 await writeFile(script,`from pathlib import Path
import os,sys,time,subprocess
root=Path(__file__).parent
leaf=len(sys.argv)>1
(root/('leaf.pid' if leaf else 'root.pid')).write_text(str(os.getpid()))
if not leaf:
    child=subprocess.Popen([sys.executable,__file__,'leaf'])
while True:
    time.sleep(.1)
`);
 await assert.rejects(()=>runBoundedLocalProcess(resolve('.venv-docling-v3/Scripts/python.exe'),[script],5000),/timed out; process tree terminated/);
 for(const name of ['root.pid','leaf.pid']){
  const pid=Number(await readFile(resolve(folder,name),'utf8'));assert(Number.isInteger(pid)&&pid>0);
  assert.throws(()=>process.kill(pid,0),`Test process ${name} survived timeout`);
 }
 const result={platform:process.platform,normalExit:true,nonzeroRejected:true,timeoutRejected:true,actualPythonInterpreterStopped:true,actualPythonDescendantStopped:true,productionProcessesTouched:false,externalCalls:0};
 await writeFile('tmp/local-process-tree-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{assert(folder.startsWith(resolve('tmp')+sep));await rm(folder,{recursive:true,force:true});}
