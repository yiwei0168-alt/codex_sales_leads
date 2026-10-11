import {z} from 'zod';
import {getPool} from '../src/lib/rag/db';
import {processNextSkillShadow} from '../src/lib/assistant/main/skill-shadow';

const userId=z.uuid().parse(process.argv[2]);let stop=false;
process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
try{
 do{
  const result=await processNextSkillShadow(userId);console.log(JSON.stringify(result));
  if(process.argv.includes('--once'))break;
  if(!result.claimed)await new Promise(resolve=>setTimeout(resolve,5000));
 }while(!stop);
}finally{await getPool().end();}
