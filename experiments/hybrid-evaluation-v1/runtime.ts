import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
export const local='.local-runtime/hybrid-evaluation-v1';
export const userId='a1111111-1111-4111-8111-111111111111';
export const otherUserId='a2222222-2222-4222-8222-222222222222';
export const sha=(value:string)=>createHash('sha256').update(value.replaceAll('\r\n','\n')).digest('hex');
export const json=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
export const id=(value:string)=>{const h=sha(value);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
export async function bindRuntime(){
 const c=JSON.parse(await readFile(`${local}/private-runtime.json`,'utf8'));
 if(c.container!=='hybrid-evaluation-v1-postgres'||c.port!==55439||c.database!=='hybrid_evaluation_v1')throw Error('Unexpected isolated database binding');
 // Only this runner process changes. Never edit .env files or the active service.
 process.env.DATABASE_URL=`postgresql://eval_app:${c.applicationPassword}@127.0.0.1:55439/hybrid_evaluation_v1`;
 delete process.env.DATABASE_MIGRATION_URL;
 process.env.DATABASE_APPLICATION_ROLE='network_copilot_app';
 process.env.MAILBOX_CREDENTIAL_KEY=c.mailKey;
 process.env.ENABLE_HYBRID_EXECUTION='1';
 const pool=new Pool({host:'127.0.0.1',port:55439,database:c.database,user:'eval_owner',password:c.adminPassword});
 const marker=await pool.query("select to_regclass('eval_control.migrations') as marker,current_database() as db");
 if(!marker.rows[0]?.marker||marker.rows[0].db!==c.database){await pool.end();throw Error('Isolated database marker missing');}
 return pool;
}
export async function verifyDesign(){
 const text=await readFile('experiments/hybrid-evaluation-v1/manifest.json','utf8'),manifest=JSON.parse(text);
 for(const [path,hash] of Object.entries(manifest.sha256))if(sha(await readFile(path,'utf8'))!==hash)throw Error(`Design source drift: ${path}`);
 return sha(text);
}
export type Attempt={identity:string;status:'started'|'completed'|'unknown';startedAt:string;endedAt?:string;latencyMs?:number;response?:unknown;error?:{name:string;code?:string;status?:number}};
/** Exclusive claim before networking; an interrupted/unknown attempt is never reissued. */
export async function once(path:string,identity:string,invoke:()=>Promise<unknown>):Promise<Attempt>{
 try{const old=JSON.parse(await readFile(path,'utf8')) as Attempt;if(old.identity!==identity)throw Error('Attempt identity drift');return old;}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const startedAt=new Date().toISOString(),clock=performance.now();
 await writeFile(path,json({identity,status:'started',startedAt}),{flag:'wx'});
 let outcome:Attempt;
 try{outcome={identity,status:'completed',startedAt,response:await invoke()};}
 catch(error){const e=error as {name?:string;code?:string;status?:number};outcome={identity,status:'unknown',startedAt,error:{name:e.name??'Error',
  ...(typeof e.code==='string'?{code:e.code}:{}),...(typeof e.status==='number'?{status:e.status}:{})}};}
 outcome.endedAt=new Date().toISOString();outcome.latencyMs=performance.now()-clock;
 // If persistence fails the exclusive started marker remains; do not retry transport.
 await writeFile(path,json(outcome));return outcome;
}
export async function ensureDirectory(path:string){await mkdir(path,{recursive:true});}
