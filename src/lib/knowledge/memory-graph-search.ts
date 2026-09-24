import {existsSync} from "node:fs";
import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {tenantQuery} from "@/lib/rag/db";

type MemoryRow={id:string;kind:string;content:string;recorded_at:Date;valid_from:Date|null;valid_until:Date|null;business_validity:"effective"|"unknown"};
type GraphLookup=(userId:string,query:string)=>Promise<string[]>;
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function graphObservationIds(userId:string,query:string):Promise<string[]>{
  const python=resolve(process.cwd(),".venv-graphiti-local",process.platform==="win32"?"Scripts/python.exe":"bin/python");
  if(!existsSync(python))throw new Error("Local Graphiti runtime unavailable");
  const script=resolve(process.cwd(),"scripts/search-memory-graph.py");
  const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV,PATH:process.env.PATH,
    SystemRoot:process.env.SystemRoot,USERPROFILE:process.env.USERPROFILE,
    APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,
    TEMP:process.env.TEMP,TMP:process.env.TMP,PYTHONNOUSERSITE:"1",PYTHONUTF8:"1",
    GRAPHITI_TELEMETRY_ENABLED:"false",NO_PROXY:"127.0.0.1,localhost,::1"};
  return new Promise<string[]>((accept,reject)=>{
    const child=spawn(python,[script],{cwd:process.cwd(),env,stdio:["pipe","pipe","pipe"],windowsHide:true});
    let output="",settled=false,tooLarge=false;
    const finish=(error?:Error,ids?:string[])=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else accept(ids??[]);};
    const timer=setTimeout(()=>{child.kill();finish(new Error("Local graph search timed out"));},5000);
    child.stdout.on("data",(chunk:Buffer)=>{output+=chunk.toString("utf8");if(output.length>4096){tooLarge=true;child.kill();}});
    child.stderr.on("data",()=>{});
    child.stdin.on("error",()=>finish(new Error("Local graph search input failed")));
    child.once("error",()=>finish(new Error("Local graph search unavailable")));
    child.once("close",code=>{
      if(code!==0||tooLarge)return finish(new Error("Local graph search failed"));
      try{
        const result=JSON.parse(output) as {ids?:unknown};
        if(!Array.isArray(result.ids)||result.ids.length>24||result.ids.some(id=>typeof id!=="string"||!UUID_PATTERN.test(id)))throw new Error();
        finish(undefined,result.ids);
      }catch{finish(new Error("Local graph search receipt invalid"));}
    });
    child.stdin.end(JSON.stringify({ownerId:userId,query}));
  });
}

/** Graph only proposes IDs. Every visible result is freshly checked in PostgreSQL. */
export async function searchMemoryWithGraph(userId:string,query:string,businessAt:string,knownAt:string,
  scope:{marketCode?:string;companyId?:string}={},lookup:GraphLookup=graphObservationIds){
  const term=query.trim();
  if(!term||term.length>200)throw new Error("Invalid memory query");
  if(!Number.isFinite(Date.parse(businessAt))||!Number.isFinite(Date.parse(knownAt)))throw new Error("Invalid memory time");
  let ids:string[]=[];
  try{ids=await lookup(userId,term);}catch{/* PostgreSQL remains available when the graph is down. */}
  const safeIds=[...new Set(ids.filter(id=>UUID_PATTERN.test(id)))].slice(0,24);
  const find=async(graphIds:string[])=>tenantQuery<MemoryRow>(userId,`
    select m.id,m.kind,m.content,m.recorded_at,m.valid_from,m.valid_until,
      case when m.valid_from is null then 'unknown' else 'effective' end as business_validity
    from agent_memory_observation m where m.owner_id=$1 and m.recorded_at<=$2::timestamptz
      and (m.valid_from is null or m.valid_from<=$3::timestamptz)
      and (m.valid_until is null or m.valid_until>$3::timestamptz)
      and (m.market_code is null or m.market_code=$4) and (m.company_id is null or m.company_id=$5)
      and (cardinality(m.market_codes)=0 or $4=any(m.market_codes))
      and (cardinality(m.company_ids)=0 or $5=any(m.company_ids))
      and not exists(select 1 from agent_memory_observation r where r.owner_id=$1
        and r.recorded_at<=$2::timestamptz and (r.corrects_id=m.id or r.invalidates_id=m.id))
      and position(lower($7) in lower(m.content))>0
      and ($6::uuid[] is null or m.id=any($6::uuid[]))
    order by m.recorded_at desc,m.id desc limit 12`,
    [userId,knownAt,businessAt,scope.marketCode??null,scope.companyId??null,graphIds.length?graphIds:null,term]);
  if(safeIds.length){
    const rows=await find(safeIds);
    if(rows.length)return {path:"graph" as const,rows};
  }
  return {path:"postgres" as const,rows:await find([])};
}
