import nextEnv from "@next/env";
import { processMailboxWork } from "../src/lib/mailbox/work-queue";
import {getPool,query} from '../src/lib/rag/db';
nextEnv.loadEnvConfig(process.cwd());
let stopping=false,nextSchedulePoll=0;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
try{do{
  try{if(Date.now()>=nextSchedulePoll){await query('select enqueue_due_mailbox_daily_sync()');nextSchedulePoll=Date.now()+30000;}await processMailboxWork();}catch(error){
    if(process.argv.includes('--once'))throw error;
    console.error('Mailbox worker unavailable; retrying without replaying uncertain learning.');
  }
  if(process.argv.includes('--once'))break;
  await new Promise(resolve=>setTimeout(resolve,1500));
}while(!stopping);}finally{await getPool().end();}
