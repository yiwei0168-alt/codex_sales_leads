import assert from 'node:assert/strict';
import {registerVectorlessUpload} from '../../src/lib/knowledge/vectorless-registration';
import {getPool} from '../../src/lib/rag/db';

const url=new URL(process.env.DATABASE_URL!);
assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
assert(/^\/ma11_replay_[a-f0-9]{12}$/.test(url.pathname));
const argument=(key:string)=>process.argv.find(value=>value.startsWith(`--${key}=`))?.split('=')[1];
const owner=argument('owner-id'),job=argument('job-id');
assert(owner&&job&&[owner,job].every(value=>/^[a-f0-9-]{36}$/.test(value)));
try{await registerVectorlessUpload(owner,job,{language:'en',authorityLevel:2});}
finally{await getPool().end();}
