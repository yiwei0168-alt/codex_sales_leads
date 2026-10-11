import {spawn} from 'node:child_process';

/** Owns only the process it spawns. On timeout, terminate its entire local tree. */
export function runBoundedLocalProcess(executable:string,args:string[],timeoutMs:number):Promise<void>{
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('Positive local process timeout required');
 return new Promise((done,reject)=>{
  const child=spawn(executable,args,{cwd:process.cwd(),windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  let timedOut=false,stderr='',termination:Promise<void>|undefined;
  child.stdout.on('data',()=>{});child.stderr.on('data',part=>{stderr=(stderr+String(part)).slice(-2000);});
  const timer=setTimeout(()=>{
   timedOut=true;
   if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;
   if(process.platform==='win32'){
    termination=new Promise<void>((resolve,rejectKill)=>{
     const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
     killer.once('error',rejectKill);killer.once('exit',code=>code===0?resolve():rejectKill(new Error('Local process tree termination failed')));
    });
   }else{
    try{process.kill(-child.pid,'SIGKILL');termination=Promise.resolve();}catch(error){termination=Promise.reject(error);}
   }
   void termination.catch(reject);
  },timeoutMs);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',async code=>{
   clearTimeout(timer);
   try{await termination;if(timedOut)throw new Error('Local process timed out; process tree terminated');
    if(code!==0)throw new Error(`Local process failed: ${code}; ${stderr}`);done();
   }catch(error){reject(error);}
  });
 });
}
