import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {tenantQuery} from "@/lib/rag/db";

export type GraphObservation={
  ownerId:string;observationId:string;kind:string;content:string;
  recordedAt:Date|string;validFrom:Date|string|null;validUntil:Date|string|null;
};
type Projector=(observation:GraphObservation)=>Promise<void>;

/** The subprocess receives one authorized observation over stdin, never as a command argument. */
export async function projectMemoryObservation(observation:GraphObservation){
  const python=resolve(process.cwd(),".venv-graphiti-local",process.platform==="win32"?"Scripts/python.exe":"bin/python");
  if(!existsSync(python))throw new Error("Local Graphiti runtime unavailable");
  const script=resolve(process.cwd(),"scripts/project-memory-observation.py");
  const env:NodeJS.ProcessEnv={
    NODE_ENV:process.env.NODE_ENV,
    PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,USERPROFILE:process.env.USERPROFILE,
    APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,
    TEMP:process.env.TEMP,TMP:process.env.TMP,PYTHONNOUSERSITE:"1",PYTHONUTF8:"1",
    GRAPHITI_TELEMETRY_ENABLED:"false",NO_PROXY:"127.0.0.1,localhost,::1",
  };
  await new Promise<void>((accept,reject)=>{
    const child=spawn(python,[script],{cwd:process.cwd(),env,stdio:["pipe","pipe","pipe"],windowsHide:true});
    let output="",tooLarge=false,settled=false;
    const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else accept();};
    const timer=setTimeout(()=>{child.kill();finish(new Error("Local graph projection timed out"));},120000);
    child.stdout.on("data",(chunk:Buffer)=>{output+=chunk.toString("utf8");if(output.length>4096){tooLarge=true;child.kill();}});
    child.stderr.on("data",()=>{});
    child.stdin.on("error",()=>finish(new Error("Local graph projection input failed")));
    child.once("error",()=>finish(new Error("Local graph projection unavailable")));
    child.once("close",code=>{
      if(code!==0||tooLarge)return finish(new Error("Local graph projection failed"));
      try{
        const result=JSON.parse(output) as {projected?:boolean;observationId?:string};
        if(result.projected!==true||result.observationId!==observation.observationId)throw new Error();
        finish();
      }catch{finish(new Error("Local graph projection receipt invalid"));}
    });
    child.stdin.end(JSON.stringify(observation));
  });
}

/** One account-scoped delivery. Replays are safe because graph UUIDs derive from PG IDs. */
export async function processMemoryGraphOutbox(userId:string,observationId:string,project:Projector=projectMemoryObservation){
  const lease=randomUUID();
  const claimed=await tenantQuery<{observation_id:string}>(userId,`update agent_memory_graph_outbox o
    set lease_token=$3,leased_at=now(),attempt_count=attempt_count+1
    where o.observation_id=$2 and o.delivered_at is null and o.next_attempt_at<=now()
      and (o.lease_token is null or o.leased_at<now()-interval '5 minutes')
      and exists(select 1 from agent_memory_observation m join app_user u on u.id=m.owner_id and u.status='active'
        where m.id=o.observation_id and m.owner_id=$1)
    returning o.observation_id`,[userId,observationId,lease]);
  if(!claimed.length)return "busy";
  try{
    const rows=await tenantQuery<{id:string;owner_id:string;kind:string;content:string;recorded_at:Date;valid_from:Date|null;valid_until:Date|null}>(userId,
      `select m.id,m.owner_id,m.kind,m.content,m.recorded_at,m.valid_from,m.valid_until
       from agent_memory_observation m join app_user u on u.id=m.owner_id and u.status='active'
       where m.id=$1 and m.owner_id=$2 and exists(select 1 from agent_memory_graph_outbox o
         where o.observation_id=m.id and o.lease_token=$3 and o.delivered_at is null
         and o.leased_at>clock_timestamp()-interval '5 minutes')`,[observationId,userId,lease]);
    const row=rows[0];
    if(!row)throw new Error("Observation unavailable");
    await project({ownerId:row.owner_id,observationId:row.id,kind:row.kind,content:row.content,
      recordedAt:row.recorded_at,validFrom:row.valid_from,validUntil:row.valid_until});
    const delivered=await tenantQuery<{observation_id:string}>(userId,`update agent_memory_graph_outbox
      set delivered_at=now(),lease_token=null,leased_at=null,last_error=null
      where observation_id=$1 and lease_token=$2 and delivered_at is null
      and leased_at>clock_timestamp()-interval '5 minutes'
      and exists(select 1 from app_user u where u.id=$3 and u.status='active') returning observation_id`,[observationId,lease,userId]);
    return delivered.length?"delivered":"busy";
  }catch{
    await tenantQuery(userId,`update agent_memory_graph_outbox
      set lease_token=null,leased_at=null,last_error='local_graph_failed',
        next_attempt_at=now()+interval '10 minutes'
      where observation_id=$1 and lease_token=$2 and delivered_at is null`,[observationId,lease]);
    return "queued";
  }
}
