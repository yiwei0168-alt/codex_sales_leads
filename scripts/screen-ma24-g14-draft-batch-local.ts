/** Diagnostic near-neighbor screen. Embedding scores are not independence verdicts. */
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {buildKnowledgeEvaluationCorpus,knowledgeEvaluationCorpusHash} from '../src/lib/knowledge/evaluation/corpus';
import {embedTextsWithBge} from '../src/lib/rag/bge-client';

const sources=[
 'ma24-g14-eu-xlsx-cell-review-2026-10-14.json',
 'ma24-g14-itu-pdf-conflict-review-2026-10-14.json',
 'ma24-g14-etsi-long-pdf-page-review-2026-10-14.json',
 'ma24-g14-ieee-auto-sd4addr-candidate-2026-10-14.json',
 'ma24-g14-ons-xlsx-candidate-2026-10-14.json',
 'ma24-g14-ons-5g-xlsx-candidate-2026-10-14.json',
];
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
type Draft={id:string;question:string};
const drafts:Array<Draft&{evidenceFile:string;sourceSha256:string;draftSha256:string}>=[];
for(const file of sources){
 const raw=await readFile(path.resolve('docs/evidence',file),'utf8');
 const candidate=JSON.parse(raw) as {sha256?:string;draftQuestions?:Draft[];draftQuestion?:Draft};
 const rows=candidate.draftQuestions??(candidate.draftQuestion?[candidate.draftQuestion]:[]);
 if(!/^[a-f0-9]{64}$/.test(candidate.sha256??'')||rows.length===0)throw new Error(`Invalid draft source: ${file}`);
 for(const row of rows){
  if(!row.id||!row.question)throw new Error(`Invalid draft: ${file}`);
  drafts.push({...row,evidenceFile:file,sourceSha256:candidate.sha256!,
   draftSha256:hash(JSON.stringify({sourceSha256:candidate.sha256,id:row.id,question:row.question}))});
 }
}
if(new Set(drafts.map(row=>row.id)).size!==drafts.length)throw new Error('Duplicate draft IDs');

const corpus=buildKnowledgeEvaluationCorpus();
const blindRaw=await readFile('tmp/ma24-holdout-evaluation/blind-questions.json','utf8');
const blind=JSON.parse(blindRaw) as {cases:Array<{caseId:string;query:string}>};
const old=[...corpus.cases.map(row=>({id:row.id,query:row.query,source:'old-300'})),
 ...blind.cases.map(row=>({id:row.caseId,query:row.query,source:'historical-blind'}))];
const grouped=new Map<string,Array<{id:string;source:string}>>();
for(const row of old)grouped.set(row.query,[...(grouped.get(row.query)??[]),{id:row.id,source:row.source}]);
const unique=[...grouped.keys()];
const inputs=[...drafts.map(row=>row.question),...unique];
const vectors:number[][]=[];
for(let offset=0;offset<inputs.length;offset+=32){
 vectors.push(...await embedTextsWithBge(inputs.slice(offset,offset+32),fetch,120_000));
 console.log(JSON.stringify({embedded:vectors.length,total:inputs.length}));
}
const questions=drafts.map((draft,index)=>({
 id:draft.id,question:draft.question,evidenceFile:draft.evidenceFile,
 sourceSha256:draft.sourceSha256,draftSha256:draft.draftSha256,
 neighbors:unique.map((query,position)=>({
  score:Number(vectors[index].reduce((sum,item,i)=>sum+item*vectors[drafts.length+position][i],0).toFixed(6)),
  query,refs:grouped.get(query),
 })).sort((a,b)=>b.score-a.score).slice(0,10),
}));
const report={schema:'ma24-g14-draft-batch-neighbor-screen-v1',
 oldCorpusVersion:corpus.version,oldCorpusSha256:knowledgeEvaluationCorpusHash(corpus),
 historicalBlindSha256:hash(blindRaw),oldRows:old.length,uniqueOldQueries:unique.length,
 model:'BAAI/bge-m3',revision:'5617a9f61b028005a4858fdac845db406aefb181',dimensions:1024,
 questions,semanticIndependenceProven:false,qualityAccepted:false,cloudCalls:0};
const output=path.resolve('tmp/ma24-independent-quarantine/g14-draft-batch-overlap-screen-v4.json');
await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({output,questionCount:questions.length,oldRows:old.length,uniqueOldQueries:unique.length,
 topScores:questions.map(row=>({id:row.id,score:row.neighbors[0]?.score,query:row.neighbors[0]?.query}))}));
