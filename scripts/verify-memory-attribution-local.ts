import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {Agent,fetch as directFetch} from 'undici';
import {extractLocalPreferences,extractLocalBusinessFacts,extractLocalExperiences,extractLocalMemoryCorrection} from '../src/lib/knowledge/local-memory-extraction';
import {validateNaturalCorrection} from '../src/lib/knowledge/natural-memory-correction';
const cases=[
 {id:'direct-preference',kind:'preference',text:'I prefer concise summaries.',positive:true},
 {id:'customer-preference',kind:'preference',text:'Please summarize this message. Customer said: I prefer concise summaries.',positive:false},
 {id:'customer-fact',kind:'fact',text:'请整理沟通记录。客户说：我们有三个分销商。',positive:false},
 {id:'customer-experience',kind:'experience',text:'Please summarize this message. The customer wrote: We found comparing original tables reduced missed specifications.',positive:false},
 {id:'direct-correction',kind:'correction',text:'I previously said I prefer long reports. That was wrong. I prefer concise reports.',positive:true},
 {id:'customer-correction',kind:'correction',text:'Please summarize this message. The customer wrote: I previously said I prefer long reports. That was wrong. I prefer concise reports.',positive:false},
] as const;
const directory=`tmp/memory-attribution/${randomUUID()}`;await mkdir(directory,{recursive:true});
await writeFile(`${directory}/cases.json`,JSON.stringify(cases,null,2),{flag:'wx'});
const agent=new Agent(),results=[];let calls=0;
console.log(JSON.stringify({directory,maximumCalls:cases.length,privateData:false,developmentOnly:true}));
try{
 for(const item of cases){
  const fetcher:typeof fetch=async(input,init)=>{
   const url=new URL(String(input));assert.equal(url.protocol,'http:');assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert(['/api/chat','/api/tags'].includes(url.pathname));
   if(url.pathname==='/api/chat'){assert(++calls<=cases.length);const body=JSON.parse(String(init?.body));assert.equal(body.options.num_predict,1024);}
   const response=await directFetch(url,{...init,dispatcher:agent,redirect:'error'} as Parameters<typeof directFetch>[1]);
   if(url.pathname==='/api/chat')await writeFile(`${directory}/${item.id}-raw.json`,await response.clone().text(),{flag:'wx'});
   return response as unknown as Response;
  };
  try{
   let accepted=false,output:unknown;
   if(item.kind==='correction'){
    output=validateNaturalCorrection(item.text,await extractLocalMemoryCorrection(item.text,fetcher));accepted='correction' in (output as object);
   }else{
    const extract=item.kind==='preference'?extractLocalPreferences:item.kind==='fact'?extractLocalBusinessFacts:extractLocalExperiences;
    const items=await extract(item.text,fetcher);output=items;accepted=items.length>0;
   }
   results.push({id:item.id,passed:accepted===item.positive,accepted,outputSha256:createHash('sha256').update(JSON.stringify(output)).digest('hex')});
   await writeFile(`${directory}/${item.id}-validated.json`,JSON.stringify(output,null,2),{flag:'wx'});
  }catch(error){results.push({id:item.id,passed:false,error:error instanceof Error?error.message:'unknown'});}
  console.log(JSON.stringify(results.at(-1)));
 }
 const report={directory,developmentOnly:true,synthetic:true,model:'qwen3:8b',calls,maximumOutputTokensPerCall:1024,cloudCalls:0,productionWrites:0,passed:results.filter(row=>row.passed).length,total:cases.length,results};
 await writeFile(`${directory}/result.json`,JSON.stringify(report,null,2),{flag:'wx'});
 await writeFile('tmp/memory-attribution-latest.json',JSON.stringify(report,null,2));
 if(report.passed!==report.total)process.exitCode=1;
}finally{await agent.close();}
