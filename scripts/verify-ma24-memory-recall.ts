import assert from 'node:assert/strict';
import {graphObservationIds,searchMemoryWithGraph} from '../src/lib/knowledge/memory-graph-search';
import {getPool} from '../src/lib/rag/db';

// Private stdin contains only this disposable fixture's UUIDs and knowledge
// instants. Use the actual local graph lookup, then the normal PG revalidation.
let raw='';for await(const chunk of process.stdin){raw+=String(chunk);assert(raw.length<=4096);}
const input=JSON.parse(raw) as {owner:string;originalId:string;correctedId:string;originalKnownAt:string;correctedKnownAt:string;afterUndo:boolean};
for(const id of [input.owner,input.originalId,input.correctedId])assert(/^[a-f0-9-]{36}$/.test(id));
try{
 const ids=await graphObservationIds(input.owner,'报告');
 assert(ids.includes(input.originalId)&&ids.includes(input.correctedId),'Actual graph must retain original/corrected candidates for revalidation');
 const lookup=async()=>ids,now=new Date().toISOString();
 const current=await searchMemoryWithGraph(input.owner,'报告',now,now,{},lookup);
 if(input.afterUndo)assert.deepEqual(current.rows,[]);
 else{assert.equal(current.path,'graph');assert.deepEqual(current.rows.map(row=>row.id),[input.correctedId]);assert.equal(current.rows[0].business_validity,'unknown');}
 const past=await searchMemoryWithGraph(input.owner,'报告',now,input.originalKnownAt,{},lookup);
 assert.equal(past.path,'graph');assert.deepEqual(past.rows.map(row=>row.id),[input.originalId]);
 const correctedPast=await searchMemoryWithGraph(input.owner,'报告',now,input.correctedKnownAt,{},lookup);
 assert.equal(correctedPast.path,'graph');assert.deepEqual(correctedPast.rows.map(row=>row.id),[input.correctedId]);
 console.log(JSON.stringify({actualLocalGraphLookup:true,graphCandidateCount:ids.length,currentRecallRevalidated:true,afterUndo:input.afterUndo,
  staleGraphCannotReviveOriginalOrUndoneCorrection:input.afterUndo,historicalOriginalAndCorrectionRetained:true,unknownBusinessValidityPreserved:true}));
}finally{await getPool().end();}
