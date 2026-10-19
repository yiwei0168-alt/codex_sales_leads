import assert from 'node:assert/strict';

/** Same synthetic observations produced by the actual worker, read and revoked
 * through authenticated product HTTP. No direct mutation of observation rows. */
export async function verifyMa24MemoryHttpFlow(input:{base:string;ownerCookie:string;peerCookie:string;originalId:string;correctedId:string}){
 const base=new URL(input.base);assert.equal(base.protocol,'http:');assert.equal(base.hostname,'127.0.0.1');
 const endpoint=`${base.origin}/api/knowledge/observations`;
 const timeline=async(cookie:string)=>{
  const response=await fetch(`${endpoint}?view=timeline`,{headers:{cookie},redirect:'error'});
  assert.equal(response.status,200);assert(response.headers.get('cache-control')?.includes('no-store'));
  const body=await response.json() as {items:Array<{id:string;corrects_id:string|null;invalidates_id:string|null;is_invalidated:boolean;source_receipt:Record<string,unknown>}>};
  return body.items;
 };
 const change=(cookie:string,id:string)=>fetch(endpoint,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({action:'undo',id}),redirect:'error'});
 const before=await timeline(input.ownerCookie),original=before.find(row=>row.id===input.originalId),corrected=before.find(row=>row.id===input.correctedId);
 assert(original&&corrected);assert.equal(original.is_invalidated,true);assert.equal(corrected.corrects_id,input.originalId);assert.equal(corrected.is_invalidated,false);
 assert.equal((await timeline(input.peerCookie)).length,0);
 assert.equal((await change(input.peerCookie,input.correctedId)).status,404);
 assert.equal((await change(input.ownerCookie,input.originalId)).status,409);
 const undone=await change(input.ownerCookie,input.correctedId);assert.equal(undone.status,200);
 const invalidationId=(await undone.json() as {id:string}).id;assert(/^[a-f0-9-]{36}$/.test(invalidationId));
 const replay=await change(input.ownerCookie,input.correctedId);assert.equal(replay.status,200);assert.equal((await replay.json() as {id:string}).id,invalidationId);
 const after=await timeline(input.ownerCookie),invalidation=after.find(row=>row.id===invalidationId);
 assert(invalidation);assert.equal(invalidation.invalidates_id,input.correctedId);assert.equal(invalidation.source_receipt.type,'user-undo');
 assert.equal(after.find(row=>row.id===input.correctedId)?.is_invalidated,true);
 assert.equal(after.filter(row=>row.invalidates_id===input.correctedId).length,1);
 assert.equal((await timeline(input.peerCookie)).length,0);
 return {invalidationId,authenticatedTimelineRead:true,crossAccountReadAndUndoRejected:true,staleOriginalUndoRejected:true,
  currentCorrectionUndoVerified:true,repeatedUndoReusesInvalidation:true,historyRetainsOriginalCorrectionAndUndo:true};
}
