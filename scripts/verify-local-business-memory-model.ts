import {extractLocalBusinessFacts} from "../src/lib/knowledge/local-memory-extraction";

const samples=[
  {name:"english-owned-fact",text:"Our distributor signed a contract in 2024.",minimum:1,maximum:1},
  {name:"chinese-owned-fact",text:"我司在德国有两个经销商。",minimum:1,maximum:1},
  {name:"question",text:"What is the shipping date in this document?",minimum:0,maximum:0},
  {name:"hypothetical",text:"If our distributor signed a contract in 2024, what would change?",minimum:0,maximum:0},
  {name:"request",text:"We need to send the distributor a new contract.",minimum:0,maximum:0},
  {name:"third-party",text:"Their distributor signed a contract in 2024.",minimum:0,maximum:0},
  {name:"unconfirmed-policy",text:"Our company policy says all leads are approved.",minimum:0,maximum:0},
] as const;
const results:Record<string,number>={};
for(const sample of samples){
  const items=await extractLocalBusinessFacts(sample.text);
  if(items.length<sample.minimum||items.length>sample.maximum)throw new Error(`Local business fact contract failed: ${sample.name}`);
  results[sample.name]=items.length;
}
console.log(JSON.stringify({local:true,model:"qwen3:8b",schema:true,internalOnly:true,results}));
