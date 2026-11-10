import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {productTools} from '../../src/lib/assistant/main/tools';
// @ts-expect-error Standalone evaluation ESM module.
import {checkMechanics} from './coverage.mjs';
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const env={fixture:await read('experiments/hybrid-evaluation-v1/business-fixtures.json'),
 mail:await read('.local-runtime/hybrid-evaluation-v1/mail-binding.json'),knowledge:await read('.local-runtime/hybrid-evaluation-v1/knowledge-binding.json'),
 extension:await read('.local-runtime/hybrid-local-read-extension-v1/binding.json'),originals:await read('.local-runtime/hybrid-knowledge-originals-v2/binding.json')};
const ids=['company_search','company_assessment_read','knowledge_search','knowledge_facts'];
const checked=[];let outputCount=0;
for(const taskId of ['P01','P07','P08','P19','P20','P24'])for(const arm of ['A','B','C']){
 const path=`.local-runtime/hybrid-evaluation-v13/performance/${taskId}-${arm}-1.trace.json`,raw=await readFile(path,'utf8'),trace=JSON.parse(raw);
 for(const c of trace.calls.filter((c:{tool_id:string})=>ids.includes(c.tool_id))){
  const schema=productTools.find(t=>t.id===c.tool_id)!.output;schema.parse(c.output);outputCount++;
 }
 checked.push({taskId,arm,traceHash:createHash('sha256').update(raw.replaceAll('\r\n','\n')).digest('hex'),coverage:checkMechanics(taskId,trace.calls,env)});
}
await mkdir('experiments/hybrid-source-coverage-v2/results',{recursive:true});
const result={version:'saved-trace-compatibility-v1',paidCalls:0,independentAcceptance:false,oldGradesChanged:false,outputCount,checked};
await writeFile('experiments/hybrid-source-coverage-v2/results/saved-trace-compatibility.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({paidCalls:0,outputCount,coveragePassed:checked.filter(c=>c.coverage.passed).length,expected:18,failures:checked.filter(c=>!c.coverage.passed).map(c=>`${c.taskId}-${c.arm}`)}));
