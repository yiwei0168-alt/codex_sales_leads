import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {bindRuntime,userId,otherUserId,id,json,sha} from '../hybrid-evaluation-v1/runtime';
import {listOwnedSalesCompanies} from '../../src/lib/sales/company-list';
import {readSavedCompanyAssessment} from '../../src/lib/sales/company-detail-read';
import {upsertKnowledgeDocument} from '../../src/lib/rag/repository';
const root='experiments/hybrid-local-read-extension-v1',local='.local-runtime/hybrid-local-read-extension-v1';
const raw=await readFile('experiments/hybrid-evaluation-v1/business-fixtures.json','utf8');
type Company={id:string;name:string;domain:string;country:string;role:string;savedScore:number;scoreDate:string;source:string};
const fixture=JSON.parse(raw) as {companies:Company[];quotes:{id:string;companyId:string;date:string;price:number;currency:string;condition:string;source:string}[]};
const fixtureHash=sha(raw),admin=await bindRuntime(),workspace=id('local-read-extension/workspace');
const candidate=(c:Company)=>`eval-sales-${c.id}`,salesId=(c:Company)=>id(`local-read-extension/sales/${c.id}`);
try{
 const client=await admin.connect();
 try{
  await client.query('begin');
  await client.query('create table if not exists eval_control.local_read_extension(fixture_hash text primary key)');
  const prior=await client.query('select fixture_hash from eval_control.local_read_extension');
  if(prior.rows.length)assert.equal(prior.rows[0].fixture_hash,fixtureHash);
  else{
   await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code) values($1,$2,'global-sales','Synthetic saved companies','Global','WW')",[workspace,userId]);
   for(const country of ['GB','DE'])await client.query(`insert into lead_search_run(id,workspace_id,provider,status,target_count,country_code,scoring_policy_version,scoring_policy_snapshot,finished_at)
    values($1,$2,'synthetic-fixture','completed',12,$3,'synthetic-saved-score-v1',$4,'2026-10-31T12:00:00Z')`,
    [id(`local-read-extension/run/${country}`),workspace,country,json({synthetic:true,purpose:'Saved historical score read fixture, not active scoring'})]);
   for(const c of fixture.companies){
    const record={id:candidate(c),displayName:c.name,name:c.name,domain:c.domain,country:c.country,roles:[c.role],fitScore:c.savedScore,
     accountTier:'Unknown',supplyModel:'Unknown',brandInvolvement:'Unknown',opportunityStage:'New',priority:'Medium',synthetic:true};
    await client.query('insert into sales_company(id,external_id,canonical_name,domain,country_code,source_kind,record) values($1,$2,$3,$4,$5,\'synthetic-evaluation\',$6)',[salesId(c),candidate(c),c.name,c.domain,c.country,json(record)]);
    await client.query(`insert into workspace_company(workspace_id,company_id,account_tier,supply_model,brand_involvement,opportunity_stage,priority,market_country_code,search_run_id)
     values($1,$2,'Unknown','Unknown','Unknown','New','Medium',$3,$4)`,[workspace,salesId(c),c.country,id(`local-read-extension/run/${c.country}`)]);
    await client.query(`insert into workspace_company_market(workspace_id,company_id,country_code,candidate_id,record,search_run_id,provenance)
     values($1,$2,$3,$4,$5,$6,'assessment')`,[workspace,salesId(c),c.country,candidate(c),json(record),id(`local-read-extension/run/${c.country}`)]);
    await client.query(`insert into lead_candidate_assessment(user_id,run_id,candidate_id,company_name,domain,official_website_url,roles,primary_role,eligible,total_score,confidence,gates,dimensions,account_tier,supply_model,brand_involvement,summary,reasons,evidence,model,prompt_version,updated_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,true,$9,100,'{}','{}','Unknown','Unknown','Unknown','Synthetic historical score fixture',$10,$11,'synthetic-no-model','synthetic-saved-score-v1',$12)`,
     [userId,id(`local-read-extension/run/${c.country}`),candidate(c),c.name,c.domain,`https://${c.domain}`,[c.role],c.role,c.savedScore,['Synthetic historical score; no new assessment performed'],json([{sourceUrl:c.source,synthetic:true}]),`${c.scoreDate}T12:00:00Z`]);
   }
   await client.query('insert into eval_control.local_read_extension values($1)',[fixtureHash]);
  }
  await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 const quotations=[];
 for(const q of fixture.quotes){
  const c=fixture.companies.find(c=>c.id===q.companyId)!;
  const content=`${c.name} 报价 ${q.id}\n日期：${q.date}。价格：${q.price} ${q.currency}。适用条件：${q.condition}。不能省略该条件或声称无条件降价。`;
  const saved=await upsertKnowledgeDocument(userId,{collection:'company',externalId:`eval/quotes/${q.id}`,title:`${c.name} 报价 ${q.id} ${q.date}`,content,
   sourceUrl:q.source,sourceType:'synthetic-evaluation-quote',visibility:'private',authorityLevel:5,companyId:candidate(c),metadata:{synthetic:true,fixtureHash,quoteId:q.id}});
  quotations.push({id:q.id,documentId:saved.documentId,sourceUrl:q.source,contentHash:sha(content)});
 }
 const page=await listOwnedSalesCompanies(userId,{});assert.equal(page.items.length,12);assert.equal(page.hasMore,false);
 const groups:Record<string,number>={};for(const c of page.items)for(const r of c.roles)groups[`${c.countryCode}/${r}`]=(groups[`${c.countryCode}/${r}`]??0)+1;
 assert.deepEqual(groups,{'DE/Distributor':3,'GB/Distributor':3,'GB/Retailer':3,'GB/SI':3});
 const scores=[];
 for(const c of fixture.companies.slice(0,3)){const saved=await readSavedCompanyAssessment(userId,candidate(c));assert.equal(saved?.totalScore,c.savedScore);assert.equal(String(saved?.assessedAt).slice(0,10),c.scoreDate);scores.push({company:c.id,score:saved?.totalScore});}
 assert.equal((await listOwnedSalesCompanies(otherUserId,{})).items.length,0);
 assert.equal(await readSavedCompanyAssessment(otherUserId,candidate(fixture.companies[0])),null);
 const binding={version:'hybrid-local-read-extension-v1',fixtureHash,workspaceId:workspace,salesCandidateIds:Object.fromEntries(fixture.companies.map(c=>[c.id,candidate(c)])),quotations,groups,scores,
  savedCompanies:12,quoteDocuments:2,crossOwnerReadBlocked:true,newScoringCalls:0,externalRequests:0,productionChanged:false,publicResearchFixturesReady:false};
 await mkdir(local,{recursive:true});await mkdir(`${root}/results`,{recursive:true});await writeFile(`${local}/binding.json`,json(binding));await writeFile(`${root}/results/binding.json`,json(binding));
 console.log(json({savedCompanies:12,quotes:2,savedScoreChecks:scores.length,crossOwnerReadBlocked:true,externalRequests:0}));
}finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
