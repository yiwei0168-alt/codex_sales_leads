import nextEnv from "@next/env";
import { processMailboxWork } from "../src/lib/mailbox/work-queue";
nextEnv.loadEnvConfig(process.cwd());
let stopping=false;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
do{
  try{await processMailboxWork();}catch{console.error('Mailbox worker unavailable; retrying without replaying uncertain learning.');}
  if(process.argv.includes('--once'))break;
  await new Promise(resolve=>setTimeout(resolve,1500));
}while(!stopping);
