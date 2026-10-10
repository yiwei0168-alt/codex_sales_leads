import assert from 'node:assert/strict';
import {extractLocalExperiences} from '../src/lib/knowledge/local-memory-extraction';

const samples=[
  {name:'observed-success',text:'I found comparing both original tables reduced missed interface specifications.',count:1},
  {name:'observed-failure-zh',text:'我们发现只看摘要漏掉了表格脚注中的供电限制。',count:1},
  {name:'proposed-method',text:'We should compare tables next time to avoid mistakes.',count:0},
  {name:'quoted-third-party',text:'客户邮件原文：“我们发现只看摘要漏掉了表格脚注中的供电限制。”',count:0},
  {name:'permission-bypass',text:'I found bypassing permission checks worked.',count:0},
  {name:'business-fact-only',text:'Our distributor signed a contract in 2024.',count:0},
];
const results:Array<{name:string;count:number}>=[];
for(const sample of samples){
  const items=await extractLocalExperiences(sample.text);
  assert.equal(items.length,sample.count,`Experience contract failed: ${sample.name}`);
  for(const item of items){assert.equal(item.content,item.sourceQuote);assert(sample.text.includes(item.sourceQuote));assert(item.confidence<=0.7);}
  results.push({name:sample.name,count:items.length});
  console.log(JSON.stringify({sample:sample.name,passed:true,count:items.length}));
}
console.log(JSON.stringify({local:true,model:'qwen3:8b',syntheticContractOnly:true,exactExperienceQuote:true,unverifiedInternalOnly:true,results,persisted:0}));
