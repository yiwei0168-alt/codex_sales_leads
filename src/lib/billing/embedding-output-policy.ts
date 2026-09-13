/** Validate only the existing float embedding contract; never substitute or pad missing vectors. */
export function embeddingOutputCompletion(task:string|undefined,value:unknown,request:unknown):"complete"|"incomplete"|undefined{
  if(task!=="rag-embedding")return undefined;
  const body=value as {data?:Array<{index?:unknown;embedding?:unknown}>}|null;
  const input=request as {input?:unknown;dimensions?:unknown;encoding_format?:unknown}|null;
  const count=typeof input?.input==="string"?1:Array.isArray(input?.input)?input.input.length:0;
  const dimensions=input?.dimensions;
  if(!count||!Number.isSafeInteger(dimensions)||(dimensions as number)<=0||input?.encoding_format!=="float"
    ||!Array.isArray(body?.data)||body.data.length!==count)return "incomplete";
  const indices=new Set<number>();
  for(const item of body.data){
    if(!item||!Number.isSafeInteger(item.index)||(item.index as number)<0||(item.index as number)>=count
      ||indices.has(item.index as number)||!Array.isArray(item.embedding)||item.embedding.length!==dimensions
      ||!item.embedding.every(n=>typeof n==="number"&&Number.isFinite(n)))return "incomplete";
    indices.add(item.index as number);
  }
  return "complete";
}
