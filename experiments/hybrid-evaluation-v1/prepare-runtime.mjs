import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import pg from 'pg';

const directory=resolve('.local-runtime/hybrid-evaluation-v1');
const container='hybrid-evaluation-v1-postgres',port=55439,database='hybrid_evaluation_v1';
const configPath=`${directory}/private-runtime.json`;
const docker=(args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const sha=text=>createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
await mkdir(directory,{recursive:true});
let config;
try{config=JSON.parse(await readFile(configPath,'utf8'));}catch(error){
 if(error.code!=='ENOENT')throw error;
 config={version:'hybrid-evaluation-private-runtime-v1',container,port,database,adminPassword:randomBytes(32).toString('hex'),
  applicationPassword:randomBytes(32).toString('hex'),mailKey:randomBytes(32).toString('base64url')};
 await writeFile(configPath,JSON.stringify(config),{flag:'wx'});
}
if(config.container!==container||config.port!==port||config.database!==database)throw Error('Unexpected local binding');
const ids=docker(['ps','-a','--filter',`name=^/${container}$`,'--format','{{.ID}}']);
if(!ids){
 const envPath=`${directory}/postgres.env`;
 await writeFile(envPath,`POSTGRES_USER=eval_owner\nPOSTGRES_PASSWORD=${config.adminPassword}\nPOSTGRES_DB=${database}\n`);
 await mkdir(`${directory}/postgres-data`,{recursive:true});
 docker(['run','-d','--name',container,'--label','codex.evaluation=hybrid-evaluation-v1','--restart=no',
  '-p',`127.0.0.1:${port}:5432`,'--env-file',envPath,'--mount',`type=bind,source=${directory}/postgres-data,target=/var/lib/postgresql/data`,'pgvector/pgvector:pg16']);
}else{
 const info=JSON.parse(docker(['inspect',container]))[0];
 if(info.Config.Labels?.['codex.evaluation']!=='hybrid-evaluation-v1'||info.HostConfig.PortBindings?.['5432/tcp']?.[0]?.HostPort!==String(port)
  ||info.HostConfig.PortBindings['5432/tcp'][0].HostIp!=='127.0.0.1')throw Error('Container isolation mismatch');
 if(!info.State.Running)docker(['start',container]);
}
const pool=new pg.Pool({host:'127.0.0.1',port,database,user:'eval_owner',password:config.adminPassword,connectionTimeoutMillis:3000});
try{
 let ready=false;
 for(let i=0;i<60;i++){try{await pool.query('select 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
 if(!ready)throw Error('Evaluation database not ready');
 const role=await pool.query("select 1 from pg_roles where rolname='eval_app'");
 if(!role.rowCount)await pool.query(`create role eval_app login password '${config.applicationPassword}' nosuperuser nobypassrls`);
 const tables=await pool.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
 const marker=await pool.query("select to_regclass('eval_control.migrations') as marker");
 if(!marker.rows[0].marker&&tables.rows[0].n)throw Error('Refusing nonempty unmarked database');
 await pool.query('create schema if not exists eval_control; create table if not exists eval_control.migrations(name text primary key,sha256 text not null)');
 const files=(await readdir('db/migrations')).filter(f=>/^\d+.*\.sql$/.test(f)).sort();
 for(const file of files){
  const sql=await readFile(`db/migrations/${file}`,'utf8'),hash=sha(sql);
  const old=await pool.query('select sha256 from eval_control.migrations where name=$1',[file]);
  if(old.rowCount){if(old.rows[0].sha256!==hash)throw Error(`Migration drift: ${file}`);continue;}
  const client=await pool.connect();
  try{await client.query('begin');await client.query(sql);await client.query('insert into eval_control.migrations values($1,$2)',[file,hash]);await client.query('commit');}
  catch(error){await client.query('rollback');throw new Error(`Evaluation migration ${file}: ${error.code??error.name}`);}finally{client.release();}
 }
 await pool.query('grant network_copilot_app to eval_app');
 console.log(JSON.stringify({isolated:true,container,loopbackPort:port,migrations:files.length,productionDatabaseAccess:false}));
}finally{await pool.end();}
