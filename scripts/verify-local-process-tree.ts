import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
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
 let parentDeathVerified=false,rootExitDescendantStopped=false;
 if(process.platform==='win32'){
  const runner=resolve(folder,'parent.mts');
  await writeFile(runner,`import {runBoundedLocalProcess} from ${JSON.stringify(pathToFileURL(resolve('scripts/lib/run-bounded-local-process.ts')).href)}; await runBoundedLocalProcess(${JSON.stringify(resolve('.venv-docling-v3/Scripts/python.exe'))},[${JSON.stringify(script)}],60000);`);
  await rm(resolve(folder,'root.pid'));await rm(resolve(folder,'leaf.pid'));
  const parent=spawn(process.execPath,['--require','./scripts/patch-node-user.cjs','--import','tsx',runner],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let parentError='';parent.stderr.on('data',part=>{parentError=(parentError+String(part)).slice(-2000);});
  const exited=new Promise<void>((done,reject)=>{parent.once('exit',()=>done());parent.once('error',reject);});
  const waitDead=async(pid:number)=>{for(let i=0;i<100;i++){try{process.kill(pid,0);}catch{return;}await new Promise(done=>setTimeout(done,50));}assert.fail(`Owned process ${pid} survived parent exit`);};
  try{
   let ready=false;
   for(let i=0;i<200;i++){if(await readFile(resolve(folder,'leaf.pid'),'utf8').catch(()=>null)){ready=true;break;}await new Promise(done=>setTimeout(done,50));}
   assert(ready,`Child tree did not start: ${parentError}`);assert(parent.kill());await exited;
   for(const name of ['root.pid','leaf.pid'])await waitDead(Number(await readFile(resolve(folder,name),'utf8')));
   parentDeathVerified=true;
  }finally{if(parent.exitCode===null&&parent.signalCode===null){parent.kill();await exited;}}
  // Even a normally exiting root must not leave an asynchronous descendant.
  const exits=resolve(folder,'root-exits.py');
  await writeFile(exits,`from pathlib import Path\nimport subprocess,sys,time\nroot=Path(__file__).parent\np=subprocess.Popen([sys.executable,str(root/'tree.py'),'leaf'])\n(root/'orphan.pid').write_text(str(p.pid))\n`);
  await runBoundedLocalProcess(resolve('.venv-docling-v3/Scripts/python.exe'),[exits],5000);
  await waitDead(Number(await readFile(resolve(folder,'orphan.pid'),'utf8')));rootExitDescendantStopped=true;
 }
 const result={platform:process.platform,normalExit:true,nonzeroRejected:true,timeoutRejected:true,actualPythonInterpreterStopped:true,actualPythonDescendantStopped:true,parentDeathVerified,rootExitDescendantStopped,productionProcessesTouched:false,externalCalls:0};
 await writeFile('tmp/local-process-tree-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{assert(folder.startsWith(resolve('tmp')+sep));await rm(folder,{recursive:true,force:true});}
