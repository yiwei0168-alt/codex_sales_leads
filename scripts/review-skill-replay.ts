import {readFile,writeFile} from 'node:fs/promises';
import {prepareSkillReview,gradeSkillReplay} from '../src/lib/assistant/main/skill-replay-review';

const [mode,manifestPath,resultPath,outputPath,reviewPath]=process.argv.slice(2);
if(!['prepare','grade'].includes(mode)||!manifestPath||!resultPath||!outputPath||(mode==='grade'&&!reviewPath))
  throw new Error('Usage: review-skill-replay.ts prepare|grade <manifest.json> <result.json> <new-output.json> [review.json]');
async function load(file:string){
  const text=await readFile(file,'utf8');if(Buffer.byteLength(text)>20_000_000)throw new Error('Review artifact too large');
  return JSON.parse(text);
}
const manifest=await load(manifestPath),result=await load(resultPath);
const output=mode==='prepare'?prepareSkillReview(manifest.suite??manifest,result):gradeSkillReplay(manifest.suite??manifest,result,await load(reviewPath));
// Preserve prior decisions. No network, database, model calls or activation writes.
await writeFile(outputPath,JSON.stringify(output,null,2),{flag:'wx'});
console.log(JSON.stringify({output:outputPath,mode,autoEnable:false}));
