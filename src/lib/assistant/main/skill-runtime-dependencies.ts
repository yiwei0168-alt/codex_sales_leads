/** Self-contained for execution inside the inspected read-only image. The
 * inventory has already passed the runtime entrypoint's actual byte check. */
export function measureSkillRuntimeDependencies(files:Record<string,unknown>,digest:(value:unknown)=>string){
 const dependencies:Record<string,unknown>={};
 for(const [name,value] of Object.entries(files)){
  if(!name.startsWith('node_modules/'))continue;
  if(name.includes('\\')||name.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('Runtime dependency path invalid');
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Runtime dependency record invalid');
  const entry=value as Record<string,unknown>,keys=Object.keys(entry);
  if(keys.length!==1)throw new Error('Runtime dependency record invalid');
  if(typeof entry.sha256==='string'&&/^[a-f0-9]{64}$/.test(entry.sha256))dependencies[name]={sha256:entry.sha256};
  else if(typeof entry.link==='string'&&entry.link&&!entry.link.startsWith('/')&&!entry.link.includes('\\')){
   const parts=name.split('/').slice(0,-1);
   for(const part of entry.link.split('/')){
    if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);
    if(parts[0]!=='node_modules')throw new Error('Runtime dependency link escapes dependency root');
   }
   dependencies[name]={link:entry.link};
  }else throw new Error('Runtime dependency record invalid');
 }
 const dependencyFiles=Object.keys(dependencies).length;
 if(!dependencyFiles)throw new Error('Runtime dependency inventory empty');
 return {dependencyFiles,dependencyManifestHash:digest({protocol:'skill-runtime-dependency-bytes-v1',files:dependencies})};
}
