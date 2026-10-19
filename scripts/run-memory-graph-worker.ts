import nextEnv from "@next/env";
import {setTimeout as sleep} from "node:timers/promises";
import {getPool,query} from "../src/lib/rag/db";
import {processMemoryGraphOutbox} from "../src/lib/knowledge/memory-graph-outbox";

nextEnv.loadEnvConfig(process.cwd());
if(process.env.ENABLE_MEMORY_GRAPH_PROJECTION!=="1")throw new Error("Memory graph projection is disabled pending acceptance");
let stopping=false;
process.once("SIGINT",()=>{stopping=true;});
process.once("SIGTERM",()=>{stopping=true;});
try{
  while(!stopping){
    try{
      const [job]=await query<{owner_id:string;observation_id:string}>("select owner_id,observation_id from next_memory_graph_outbox()");
      if(!job){if(process.argv.includes('--once'))break;await sleep(10000);continue;}
      const status=await processMemoryGraphOutbox(job.owner_id,job.observation_id);
      console.info(JSON.stringify({event:"memory-graph-outbox",status,observationId:job.observation_id}));
      if(process.argv.includes('--once'))break;
      if(status!=="delivered")await sleep(30000);
    }catch{
      console.error(JSON.stringify({event:'memory-graph-worker-retry',reason:'local_dependency_unavailable'}));
      if(process.argv.includes('--once')){process.exitCode=1;break;}
      if(!stopping)await sleep(30000);
    }
  }
}finally{await getPool().end();}
