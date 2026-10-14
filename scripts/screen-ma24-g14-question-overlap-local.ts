/** Diagnostic near-neighbor screen. A high or low embedding score is not an independence verdict. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildKnowledgeEvaluationCorpus,knowledgeEvaluationCorpusHash} from '../src/lib/knowledge/evaluation/corpus';
import {embedTextsWithBge} from '../src/lib/rag/bge-client';

const source=path.resolve(process.argv[2]??'');
const evidenceRoot=path.resolve('docs/evidence');
if(!source.startsWith(evidenceRoot+path.sep)||!source.endsWith('.json'))throw new Error('A committed G14 evidence JSON path is required');
const raw=await readFile(source,'utf8');
const candidate=JSON.parse(raw) as {sha256?:string;source?:{sha256?:string};draftQuestions?:Array<{id:string;question:string}>;draftQuestion?:{id:string;question:string}};
const sourceSha256=candidate.sha256??candidate.source?.sha256;
const drafts=candidate.draftQuestions??(candidate.draftQuestion?[candidate.draftQuestion]:[]);
if(!/^[a-f0-9]{64}$/.test(sourceSha256??'')||!Array.isArray(drafts)||!drafts.length
  ||drafts.some(row=>!row.id||!row.question))throw new Error('Candidate evidence lacks source hash or questions');
const corpus=buildKnowledgeEvaluationCorpus();
const blindPath=path.resolve('tmp/ma24-holdout-evaluation/blind-questions.json');
const blindRaw=await readFile(blindPath,'utf8');
const blind=JSON.parse(blindRaw) as {cases:Array<{caseId:string;query:string}>};
const old=[...corpus.cases.map(row=>({id:row.id,query:row.query,source:'old-300'})),
 ...blind.cases.map(row=>({id:row.caseId,query:row.query,source:'historical-blind'}))];
const unique=[...new Set(old.map(row=>row.query))];
const questions=drafts.map(row=>({id:row.id,query:row.question}));
const inputs=[...questions.map(row=>row.query),...unique];
const vectors:number[][]=[];
for(let offset=0;offset<inputs.length;offset+=32){
 const batch=inputs.slice(offset,offset+32);
 vectors.push(...await embedTextsWithBge(batch,fetch,120_000));
 console.log(JSON.stringify({embedded:vectors.length,total:inputs.length}));
}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const similarity=questions.map((question,index)=>{
 const neighbors=unique.map((query,position)=>{
  const matching=old.filter(row=>row.query===query);
  const score=vectors[index].reduce((sum,item,i)=>sum+item*vectors[questions.length+position][i],0);
  return {score:Number(score.toFixed(6)),query,refs:matching.map(row=>({id:row.id,source:row.source}))};
 }).sort((a,b)=>b.score-a.score).slice(0,10);
 return {id:question.id,query:question.query,neighbors};
});
const report={schema:'ma24-g14-question-neighbor-screen-v1',sourceSha256,
 evidenceSha256:hash(raw),oldCorpusVersion:corpus.version,oldCorpusSha256:knowledgeEvaluationCorpusHash(corpus),
 historicalBlindSha256:hash(blindRaw),oldRows:old.length,uniqueOldQueries:unique.length,
 model:'BAAI/bge-m3',revision:'5617a9f61b028005a4858fdac845db406aefb181',dimensions:1024,
 questions:similarity,semanticIndependenceProven:false,qualityAccepted:false,cloudCalls:0};
const output=path.resolve(process.argv[3]??'tmp/ma24-independent-quarantine/ieee-80211-overview-overlap-screen.json');
if(!output.startsWith(path.resolve('tmp')+path.sep)||!output.endsWith('.json'))throw new Error('A temporary output JSON path is required');
await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({output,questionCount:questions.length,oldRows:old.length,uniqueOldQueries:unique.length,
 topScores:similarity.map(row=>({id:row.id,score:row.neighbors[0]?.score,query:row.neighbors[0]?.query}))}));
