/** Deterministic source coverage, independent of the answer's model grade. */
export function checkMechanics(taskId,calls,{fixture,mail,knowledge,extension}){
 const read=calls.filter(c=>['success','partial'].includes(c.output?.status)),success=read.filter(c=>c.output.status==='success');
 if(taskId==='P01')return {passed:success.some(c=>c.tool_id==='mail_read'&&c.input.messageId===mail.messageIds['c1-m4']),kind:'latest-original-mail'};
 if(taskId==='P07'){
  const checks=fixture.companies.slice(0,3).map(c=>success.some(r=>r.tool_id==='company_assessment_read'&&r.input.companyExternalId===extension.salesCandidateIds[c.id]
   &&r.output.data?.assessment?.totalScore===c.savedScore&&r.output.data?.assessment?.assessedAt?.slice(0,10)===c.scoreDate));
  return {passed:checks.every(Boolean)&&!calls.some(c=>['company_score','score_review','company_score_publish'].includes(c.tool_id)),kind:'saved-assessments',checks};
 }
 if(taskId==='P08'){
  const pages=success.filter(c=>c.tool_id==='company_list'&&!c.input.countryCode),byOffset=new Map(pages.map(p=>[p.input.offset??0,p.output.data]));
  let offset=0,complete=false;const items=[],seen=new Set();
  while(!seen.has(offset)&&byOffset.has(offset)){
   seen.add(offset);const p=byOffset.get(offset);items.push(...p.items);
   if(p.hasMore===false){complete=true;break;}if(!Number.isInteger(p.nextOffset)||p.nextOffset<=offset)break;offset=p.nextOffset;
  }
  // A complete original search page plus all corresponding company states also
  // satisfies the task; a mailbox-only customer list cannot establish sales inventory.
  if(!complete){
   const search=success.find(c=>c.tool_id==='company_search'&&c.input.query===''&&!c.input.countryCode&&c.output.data?.hasMore===false);
   if(search){
    const expected=search.output.data.companies??[];
    const states=success.filter(c=>c.tool_id==='company_read').flatMap(c=>c.output.data??[]);
    complete=expected.length>0&&expected.every(c=>states.some(r=>r.candidate_id===c.id));
    if(complete)items.push(...states.map(r=>({id:r.candidate_id,countryCode:r.market_country_code,roles:r.record.roles??[]})));
   }
  }
  const unique=new Map(items.map(i=>[i.id,i])),groups={};
  for(const c of unique.values())for(const r of c.roles??[])groups[`${c.countryCode}/${r}`]=(groups[`${c.countryCode}/${r}`]??0)+1;
  const expected={'GB/Distributor':3,'GB/Retailer':3,'GB/SI':3,'DE/Distributor':3};
  const ids=Object.values(extension.salesCandidateIds);
  return {passed:complete&&unique.size===12&&ids.every(id=>unique.has(id))&&Object.keys(groups).length===4&&Object.entries(expected).every(([k,v])=>groups[k]===v),kind:'complete-sales-membership',complete,rows:unique.size,groups};
 }
 const sources=[];
 function collect(value){
  if(Array.isArray(value)){for(const item of value)collect(item);return;}
  if(!value||typeof value!=='object')return;
  if(typeof value.documentId==='string'&&typeof value.content==='string'&&value.content.trim())sources.push(value);
  for(const item of Object.values(value))if(item&&typeof item==='object')collect(item);
 }
 for(const c of read.filter(c=>['knowledge_search','knowledge_compare','knowledge_originals'].includes(c.tool_id)))collect(c.output.data);
 const documents=taskId==='P19'?extension.quotations:knowledge.documents.filter(d=>taskId==='P20'?['NX420','NX430'].includes(d.model)&&d.version==='v2':d.model==='NX410');
 const checks=documents.map(d=>{const p=fixture.products?.find(p=>p.model===d.model),source=d.sourceUrl??(d.version==='v1'?p?.historical?.source:p?.source);
  return {id:d.documentId,present:sources.some(s=>s.documentId===d.documentId&&(!source||s.sourceUrl===source))};});
 return {passed:checks.length===2&&checks.every(c=>c.present),kind:'original-document-coverage',checks};
}
