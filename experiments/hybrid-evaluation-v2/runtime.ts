import {readFile} from 'node:fs/promises';
import {sha} from '../hybrid-evaluation-v1/runtime';
export {bindRuntime,ensureDirectory,id,json,sha,userId} from '../hybrid-evaluation-v1/runtime';
export const local='.local-runtime/hybrid-evaluation-v2';
export async function verifyDesign(){
 const text=await readFile('experiments/hybrid-evaluation-v2/manifest.json','utf8'),m=JSON.parse(text);
 for(const [path,hash] of Object.entries(m.sha256))if(sha(await readFile(path,'utf8'))!==hash)throw Error(`V2 design drift: ${path}`);
 return sha(text);
}
