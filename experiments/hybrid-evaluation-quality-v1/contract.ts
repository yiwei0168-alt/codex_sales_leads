import {z} from 'zod';
const score=(max:number)=>z.number().finite().min(0).max(max);
export const reviewSchema=z.object({reviewId:z.string(),facts:score(40),completeness:score(25),citations:score(20),scope:score(10),readability:score(5),
 hardGatePass:z.boolean(),issues:z.array(z.string().min(1).max(2000)).max(20)}).strict();
export function parseQuality(text:string,ids:string[]){
 const rows=z.array(reviewSchema).length(ids.length).parse(JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')));
 if(new Set(rows.map(r=>r.reviewId)).size!==ids.length||rows.some(r=>!ids.includes(r.reviewId)))throw Error('Quality reviewer ID coverage mismatch');
 return rows.map(r=>{const total=r.facts+r.completeness+r.citations+r.scope+r.readability;return {...r,total,passed:r.hardGatePass&&total>=85};});
}
