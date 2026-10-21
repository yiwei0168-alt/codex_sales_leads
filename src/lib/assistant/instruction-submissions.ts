// The tab retains only an instruction digest and random submission identity.
// Instruction text is never persisted in browser storage.
const prefix='agent-instruction-submission-v1:';
const cache=new Map<string,string>();
const valid=(value:string|null|undefined):value is string=>Boolean(value&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
function storage(){try{return typeof window==='undefined'?undefined:window.sessionStorage;}catch{return undefined;}}
function uuid(){
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export type PendingInstructionSubmission={requestKey:string;acknowledge:()=>void};
function ticket(key:string,requestKey:string):PendingInstructionSubmission{
  return {requestKey,acknowledge:()=>{
    if(cache.get(key)===requestKey)cache.delete(key);
    try{const store=storage();if(store?.getItem(key)?.toLowerCase()===requestKey)store.removeItem(key);}catch{/* Volatile recovery remains available if storage is blocked. */}
  }};
}
export function pendingInstructionSubmissions(runId:string):PendingInstructionSubmission[]{
  const start=prefix+runId+':';
  try{const store=storage();if(store)for(let i=0;i<store.length;i++){const key=store.key(i);if(key?.startsWith(start)){const value=store.getItem(key);if(valid(value))cache.set(key,value.toLowerCase());}}}catch{/* Keep the in-memory identities. */}
  return [...cache].filter(([key])=>key.startsWith(start)).map(([key,value])=>ticket(key,value));
}
export async function prepareInstructionSubmission(runId:string,content:string):Promise<PendingInstructionSubmission>{
  const normalized=content.trim();let persistent=false,key:string;
  if(crypto.subtle){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
    key=prefix+runId+':'+[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');persistent=true;
  }else key=prefix+runId+':volatile:'+normalized;
  let existing=cache.get(key);
  if(!existing&&persistent)try{existing=storage()?.getItem(key)??undefined;}catch{/* Use the volatile cache. */}
  const requestKey=valid(existing)?existing.toLowerCase():uuid();cache.set(key,requestKey);
  if(persistent)try{storage()?.setItem(key,requestKey);}catch{/* No plaintext is ever written. */}
  return ticket(key,requestKey);
}
