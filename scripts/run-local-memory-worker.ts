import nextEnv from "@next/env";
import {setTimeout as sleep} from "node:timers/promises";
import {getPool,query} from "../src/lib/rag/db";
import {processLocalMemoryExtraction} from "../src/lib/knowledge/local-memory-extraction";

nextEnv.loadEnvConfig(process.cwd());
if(process.env.ENABLE_LOCAL_MEMORY_EXTRACTION!=="1")throw new Error("Local memory extraction is disabled until model contract tests pass");
let stopping=false;
process.once("SIGINT",()=>{stopping=true;});
process.once("SIGTERM",()=>{stopping=true;});
try{
  while(!stopping){
    const [job]=await query<{owner_id:string;run_id:string}>("select owner_id,run_id from next_local_memory_extraction_job()");
    if(!job){await sleep(10000);continue;}
    const status=await processLocalMemoryExtraction(job.owner_id,job.run_id);
    console.info(JSON.stringify({event:"local-memory-extraction",status,runId:job.run_id}));
    if(status==="queued"||status==="busy"||status==="unavailable")await sleep(30000);
  }
}finally{await getPool().end();}
