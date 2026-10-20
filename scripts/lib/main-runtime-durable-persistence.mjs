import {open,mkdir,readFile,rename,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';

// Installed before the API initializes any stores. The launcher separately pins
// the upstream module bytes: this adapter is not a generic dependency patch.
export function installDurablePersistence({FileSystemPersistence,serialize,deserialize}){
 const states=new WeakMap();
 const state=instance=>{let value=states.get(instance);if(!value){value={tail:Promise.resolve(),failure:null};states.set(instance,value);}return value;};
 const prototype=FileSystemPersistence.prototype;
 prototype.initialize=async function(cwd){
  this.filepath=join(cwd,'.langgraph_api',this.name);
  await mkdir(dirname(this.filepath),{recursive:true,mode:0o700});
  try{this.data=await deserialize(await readFile(this.filepath,'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;this.data=this.defaultSchema();}
  if(this.data==null)throw new Error('Runtime state is invalid');
  state(this);return this;
 };
 prototype.persist=function(){
  if(this.data==null||this.filepath==null)return Promise.reject(new Error('Runtime state is not initialized'));
  const current=state(this);if(current.failure)return Promise.reject(current.failure);
  // Capture before queuing: each returned promise covers this caller's state.
  const bytes=serialize(this.data),target=this.filepath;
  const write=current.tail.then(async()=>{
   if(current.failure)throw current.failure;
   const temporary=target+'.pending-'+randomUUID();let descriptor;
   try{
    descriptor=await open(temporary,'wx',0o600);await descriptor.writeFile(bytes,'utf8');
    await descriptor.sync();await descriptor.close();descriptor=undefined;
    await rename(temporary,target);
    // Linux production volume: make the atomic rename durable as well.
    if(process.platform!=='win32'){
     const directory=await open(dirname(target),'r');try{await directory.sync();}finally{await directory.close();}
    }
   }finally{
    if(descriptor)await descriptor.close();
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
   }
  });
  current.tail=write.catch(error=>{current.failure=error;});
  return write;
 };
 prototype.flush=function(){return this.persist();};
 prototype.schedulePersist=function(){return this.persist();};
 prototype.with=async function(fn){
  const current=state(this);if(current.failure)throw current.failure;
  if(this.filepath==null||this.data==null)throw new Error('Runtime state is not initialized');
  try{return await fn(this.data);}finally{await this.persist();}
 };
 prototype.withGenerator=async function*(fn){
  const current=state(this);if(current.failure)throw current.failure;
  if(this.filepath==null||this.data==null)throw new Error('Runtime state is not initialized');
  let dirty=false;
  try{yield* (typeof fn==='function'?fn(this.data,{schedulePersist:()=>{dirty=true;}}):fn);}
  finally{if(dirty)await this.persist();}
 };
}
