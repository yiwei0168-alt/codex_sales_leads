/** Read-only input audit before the authorized MA24-12 model calls. */
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {buildKnowledgeEvaluationCorpus} from "../src/lib/knowledge/evaluation/corpus";
import {hybridSearch} from "../src/lib/rag/repository";
import {modelTokensInQuery,searchDocuments} from "../src/lib/knowledge/vectorless";
import {buildControlledLexicalQuery} from "../src/lib/knowledge/query-normalizer";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
try{
  const cases=buildKnowledgeEvaluationCorpus().cases.filter(item=>item.split==="holdout"&&item.expectedOutcome==="route");
  const rows=[];const sourceStates=new Map<string,number>();
  for(const item of cases){
    const [docs,chunks]=await Promise.all([
      searchDocuments(OWNER_USER_ID,item.query),
      hybridSearch(OWNER_USER_ID,item.query,null,{structuredProductTerms:modelTokensInQuery(item.query),
        lexicalQuery:buildControlledLexicalQuery(item.query)},8,null),
    ]);
    const identities=await tenantQuery<{id:string;registration_status:string;visibility:string;source_type:string;source_sha256:string;source_location:Record<string,unknown>;externally_disclosable:boolean;current_asset:boolean}>(OWNER_USER_ID,
      `select c.id,a.registration_status,d.visibility,d.source_type,a.source_sha256,c.source_location,a.externally_disclosable,
        (v.asset_id=a.id and v.source_sha256=a.source_sha256 and v.status='ready') as current_asset
       from knowledge_chunk_v3 c join knowledge_source_revision_v3 r on r.id=c.source_revision_id
       join knowledge_asset a on a.id=r.asset_id join knowledge_document d on d.id=c.document_id
       left join knowledge_tree_version v on v.id=d.current_tree_version_id
       where c.id=any($1::uuid[])`,[chunks.map(chunk=>chunk.id)],"admin");
    for(const identity of identities){const key=`${identity.registration_status}/${identity.visibility}/${identity.source_type}/${identity.externally_disclosable}/${identity.current_asset}`;
      sourceStates.set(key,(sourceStates.get(key)??0)+1);}
    rows.push({caseId:item.id,documentCandidates:docs.length,documentTitles:docs.slice(0,6).map(doc=>doc.title),chunks:chunks.length,
      approvedChunks:identities.filter(row=>row.registration_status==="registered"&&row.visibility==="shared"&&row.externally_disclosable&&row.current_asset
        &&row.source_type.startsWith("public-")).length,
      contentBytes:chunks.reduce((sum,chunk)=>sum+Buffer.byteLength(chunk.content),0),
      registeredSharedPublic:identities.length===chunks.length&&identities.every(row=>row.registration_status==="registered"&&row.externally_disclosable&&row.current_asset
        &&row.visibility==="shared"&&row.source_type.startsWith("public-")),
      missingLocation:identities.filter(row=>!row.source_location).length});
  }
  console.log(JSON.stringify({cases:rows.length,documentCandidateMax:Math.max(...rows.map(row=>row.documentCandidates)),
    v3ContentBytesMax:Math.max(...rows.map(row=>row.contentBytes)),
    v3ContentBytesOver20k:rows.filter(row=>row.contentBytes>20000).length,
    unapprovedV3Sources:rows.filter(row=>!row.registeredSharedPublic).map(row=>row.caseId),
    v3MissingLocation:rows.filter(row=>row.missingLocation).map(row=>row.caseId),
    sourceStates:Object.fromEntries(sourceStates),rows}));
}finally{await getPool().end();}
