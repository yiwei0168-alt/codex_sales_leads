import nextEnv from '@next/env';
import {getPool} from '../src/lib/rag/db';
import {completeExtractionReview} from '../src/lib/knowledge/extraction-review';
nextEnv.loadEnvConfig(process.cwd());
const arg=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??'';
try{console.log(JSON.stringify(await completeExtractionReview(arg('user-id'),arg('job-id'),arg('artifact-sha'),arg('decision-sha'))));}
finally{await getPool().end();}
