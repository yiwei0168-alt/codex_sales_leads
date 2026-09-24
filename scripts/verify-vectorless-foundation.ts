import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,query,tenantQuery} from "../src/lib/rag/db";
import {hybridSearch} from "../src/lib/rag/repository";

nextEnv.loadEnvConfig(process.cwd());
try{
  const [pointer]=await query<{release_key:string;release_id:string;activated_at:string}>(`select r.release_key,p.release_id,p.activated_at
    from knowledge_release_pointer_v3 p join knowledge_release_v3 r on r.id=p.release_id
    where p.scope_kind='shared' order by p.activated_at desc limit 1`);
  const [tables]=await query<{count:string;secured:string}>(`select count(*)::text count,
    count(*) filter(where c.relrowsecurity and c.relforcerowsecurity)::text secured from pg_class c
    where c.relname=any(array['knowledge_tree_version','knowledge_tree_node','agent_memory_observation','agent_memory_graph_outbox'])`);
  const [gold]=await tenantQuery<{total:string;holdout:string}>(OWNER_USER_ID,`select count(*)::text total,
    count(*) filter(where split='holdout')::text holdout from knowledge_evaluation_review_v3
    where corpus_version='knowledge-eval-v3-baseline'`,[],"admin");
  const tree=await tenantQuery<{count:string}>(OWNER_USER_ID,"select count(*)::text count from knowledge_tree_version");
  const hits=await hybridSearch(OWNER_USER_ID,"WR3000",null,{},3,null);
  if(!pointer||tables?.count!=="4"||tables.secured!=="4")throw new Error("Foundation or active v3 pointer missing");
  console.log(JSON.stringify({activeV3:pointer,foundationTables:tables,treeVersions:tree[0]?.count,goldReviewRows:gold,v3Sample:hits.map(hit=>({id:hit.id,documentId:hit.documentId,title:hit.title,sourceLocation:hit.metadata?.sourceLocation??null}))},null,2));
}finally{await getPool().end();}
