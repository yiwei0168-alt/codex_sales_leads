/** Inventory only: absence from old Gold is NOT evidence of independence. */
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import nextEnv from '@next/env';
import {buildKnowledgeEvaluationCorpus,knowledgeEvaluationCorpusHash} from '../src/lib/knowledge/evaluation/corpus';

nextEnv.loadEnvConfig(process.cwd());
const connectionString=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(connectionString&&['localhost','127.0.0.1','::1'].includes(new URL(connectionString).hostname),'Local database required');
const pool=new Pool({connectionString});
const client=await pool.connect();
try{
 await client.query('begin isolation level repeatable read read only');
 await client.query("set local statement_timeout='15s'");
 const corpus=buildKnowledgeEvaluationCorpus();
 const gold=(await client.query<{expected_sources:Array<{assetSha256:string}>}>(
  'select expected_sources from knowledge_evaluation_review_v3 where corpus_version=$1',[corpus.version])).rows;
 assert.equal(gold.length,300,'Expected complete historical Gold inventory; do not silently audit a partial view');
 const exposed=new Set(gold.flatMap(row=>row.expected_sources.map(source=>source.assetSha256)));
 const sources=(await client.query<{source_sha256:string;mime_type:string;units:number}>(`
  select a.source_sha256,a.mime_type,count(distinct n.unit_index)::integer as units
  from knowledge_document d join knowledge_tree_version v on v.id=d.current_tree_version_id
  join knowledge_asset a on a.id=v.asset_id and a.document_id=d.id and a.source_sha256=v.source_sha256
  left join knowledge_tree_node n on n.version_id=v.id and n.node_kind='evidence'
  where d.status='active' and d.visibility='shared' and d.source_type like 'public-%'
    and a.registration_status='registered' and a.externally_disclosable and v.status='ready'
  group by a.source_sha256,a.mime_type order by a.mime_type,a.source_sha256`)).rows;
 const formats:Record<string,{currentSources:number;inHistoricalGold:number;notInGoldButUnproven:number;maximumUnits:number}>={};
 for(const row of sources){
  const counts=formats[row.mime_type]??={currentSources:0,inHistoricalGold:0,notInGoldButUnproven:0,maximumUnits:0};
  counts.currentSources++;counts.maximumUnits=Math.max(counts.maximumUnits,row.units);
  if(exposed.has(row.source_sha256))counts.inHistoricalGold++;else counts.notInGoldButUnproven++;
 }
 // The old corpus explicitly labels identical boundary questions as wording variants.
 // This removes ONLY those recorded suffixes, not arbitrary semantic differences.
 const normalized=new Map<string,typeof corpus.cases>();
 for(const item of corpus.cases){
  const query=item.query.replace(/（表达变体 \d+）$| \(wording variant \d+\)$/u,'').trim();
  normalized.set(query,[...(normalized.get(query)??[]),item]);
 }
 const repeated=[...normalized.values()].filter(group=>group.length>1);
 console.log(JSON.stringify({schema:'independent-source-pool-audit-v1',readOnly:true,
  corpusVersion:corpus.version,corpusSha256:knowledgeEvaluationCorpusHash(corpus),historicalGoldRows:gold.length,
  historicalGoldDistinctSources:exposed.size,currentPublicSources:sources.length,formats,
  historicalRepeatedQuestionGroups:repeated.length,
  historicalCrossSplitRepeatedGroups:repeated.filter(group=>new Set(group.map(item=>item.split)).size>1).length,
  historicalDuplicateQuestions:repeated.reduce((sum,group)=>sum+group.length-1,0),
  independentSourcesApproved:0,qualityAccepted:false,newModelCalls:0,
  limitations:['No historical retrieval outputs, development fixtures or semantic near-duplicates audited.',
   'Not-in-Gold is an inventory candidate only; it does not prove absence of development exposure.',
   'Private sources excluded. New corpus, questions, Gold and release freeze remain pending.']}));
 await client.query('rollback');
}finally{await client.query('rollback').catch(()=>undefined);client.release();await pool.end();}
