import {z} from 'zod';
import {skillAcceptanceRunIds} from './skill-acceptance-run-locks';

type Artifact=Parameters<typeof skillAcceptanceRunIds>[0]&{observations:ReadonlyArray<{caseId:string}>};
export class OriginalSourcesPendingError extends Error {
 constructor(readonly missingCaseCount:number){super('Original sources are not fully collected');this.name='OriginalSourcesPendingError';}
}

/** Explain genuinely uncollected cases without accepting a partial source set.
 * Malformed run references, mismatched historical arms and missing references
 * for observed cases remain errors. All retained source checks still apply. */
export function requireOriginalSourceCoverage(artifact:Artifact){
 const observed=new Set(artifact.observations.map(row=>row.caseId));let pending=0;
 for(const item of artifact.plan.cases){
  const groups=item.provenance==='historical-task'?['baselineSources','candidateSources']:
   item.provenance==='prospective-task'?['prospectiveSources']:item.provenance==='safety-fixture'?['safetySources']:null;
  if(!groups)throw new Error('Unsupported original source provenance');
  let absent=false;
  for(const name of groups){
   const value=artifact.rawReceipts[name];
   if(value===undefined){absent=true;continue;}
   const group=z.record(z.string(),z.unknown()).parse(value);
   if(!Object.hasOwn(group,item.id)){absent=true;continue;}
   z.object({runId:z.uuid()}).passthrough().parse(group[item.id]);
  }
  if(absent){
   if(observed.has(item.id))throw new Error('Collected original source reference missing');
   pending++;
  }else skillAcceptanceRunIds({...artifact,plan:{cases:[item]}});
 }
 if(pending)throw new OriginalSourcesPendingError(pending);
 skillAcceptanceRunIds(artifact);
}
