import {z} from "zod";

/** Keep independently valid items; never guess which duplicate ID the model intended. */
export function validateBatchItems<T extends {candidateId:string}>(output:unknown,key:string,schema:z.ZodType<T>,expectedIds:string[]){
  const envelope=z.object({[key]:z.array(z.unknown())}).parse(output);
  const raw=envelope[key];
  const expected=new Set(expectedIds);
  if(expected.size!==expectedIds.length)throw new Error("Duplicate input candidate IDs");
  const counts=new Map<string,number>();
  for(const item of raw){
    const id=item&&typeof item==="object"&&"candidateId" in item?item.candidateId:null;
    if(typeof id==="string")counts.set(id,(counts.get(id)??0)+1);
  }
  const items:T[]=[];
  for(const item of raw){
    const parsed=schema.safeParse(item);
    if(parsed.success&&expected.has(parsed.data.candidateId)&&counts.get(parsed.data.candidateId)===1)items.push(parsed.data);
  }
  return {items,complete:raw.length===expectedIds.length&&items.length===expectedIds.length,
    rejectedItems:raw.length-items.length,missingItems:expectedIds.length-items.length};
}
