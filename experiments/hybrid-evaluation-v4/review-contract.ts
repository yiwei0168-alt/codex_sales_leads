import {z} from 'zod';
import {programStateSchema} from '../../src/providers/program-decision-contract-v4';
export const labelSchema=z.object({id:z.string(),route:z.enum(['fixed_workflow','interpreter','dynamic_agent']),reason:z.string().trim().min(1).max(2000)}).strict();
export function blindInputs(cases:Array<{id:string;state:unknown}>){
 return cases.map(c=>({id:c.id,state:programStateSchema.parse(c.state)}));
}
export function parseReview(text:string,ids:string[]){
 const rows=z.array(labelSchema).length(ids.length).parse(JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')));
 if(new Set(rows.map(r=>r.id)).size!==ids.length||rows.some(r=>!ids.includes(r.id)))throw Error('Reviewer ID coverage mismatch');
 return rows;
}
