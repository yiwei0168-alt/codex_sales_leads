import {test} from 'node:test';import assert from 'node:assert/strict';import {checkMechanics} from './mechanics.mjs';
const companies=Array.from({length:12},(_,i)=>({id:`c${i+1}`,savedScore:60+i,scoreDate:'2026-10-31'}));
const extension={salesCandidateIds:Object.fromEntries(companies.map(c=>[c.id,c.id])),quotations:[{documentId:'q1'},{documentId:'q2'}]};
const env={fixture:{companies},extension,mail:{messageIds:{'c1-m4':'latest'}},knowledge:{documents:[{documentId:'p1-v1',model:'NX410',version:'v1'},{documentId:'p1-v2',model:'NX410',version:'v2'}]}};
const call=(tool_id,input,data,status='success')=>({tool_id,input,output:{status,data}});
const items=companies.map((c,i)=>({id:c.id,countryCode:i<9?'GB':'DE',roles:[i<3||i>=9?'Distributor':i<6?'Retailer':'SI']}));
test('requires the actual latest mail read',()=>{assert.equal(checkMechanics('P01',[call('mail_read',{messageId:'old'}, {})],env).passed,false);assert.equal(checkMechanics('P01',[call('mail_read',{messageId:'latest'}, {})],env).passed,true);});
test('accepts original sources inside a partial comparison, not status alone',()=>{
 assert.equal(checkMechanics('P24',[call('knowledge_compare',{},[{documentId:'p1-v1',content:'Old original'},{documentId:'p1-v2',content:'New original'}],'partial')],env).passed,true);
 assert.equal(checkMechanics('P24',[call('knowledge_compare',{},[{documentId:'p1-v1'},{documentId:'p1-v2'}],'partial')],env).passed,false);
 assert.equal(checkMechanics('P24',[call('knowledge_compare',{},[{documentId:'p1-v1'}],'partial')],env).passed,false);
});
test('requires both quotes in actual read output',()=>{assert.equal(checkMechanics('P19',[call('knowledge_search',{query:'q1 q2'},[{documentId:'q1'}])],env).passed,false);assert.equal(checkMechanics('P19',[call('knowledge_search',{},[{documentId:'q1',content:'First quote'},{documentId:'q2',content:'Second quote'}])],env).passed,true);});
test('requires a terminating membership page and exact saved groups',()=>{
 const page=call('company_list',{offset:0},{items,hasMore:false,nextOffset:null});assert.equal(checkMechanics('P08',[page],env).passed,true);
 assert.equal(checkMechanics('P08',[{...page,output:{status:'success',data:{...page.output.data,hasMore:true,nextOffset:20}}}],env).passed,false);
 assert.equal(checkMechanics('P08',[call('customer_timeline',{},page.output.data)],env).passed,false);
 assert.equal(checkMechanics('P08',[call('company_list',{}, {...page.output.data,items:items.slice(1)})],env).passed,false);
});
test('accepts multiple actual pages but never a gap',()=>{
 const a=call('company_list',{offset:0},{items:items.slice(0,5),hasMore:true,nextOffset:5}),b=call('company_list',{offset:5},{items:items.slice(5),hasMore:false,nextOffset:null});
 assert.equal(checkMechanics('P08',[a,b],env).passed,true);assert.equal(checkMechanics('P08',[a,{...b,input:{offset:20}}],env).passed,false);
});
test('rejects refreshed scores or wrong saved dates',()=>{
 const calls=companies.slice(0,3).map(c=>call('company_assessment_read',{companyExternalId:c.id},{assessment:{totalScore:c.savedScore,assessedAt:c.scoreDate+'T12:00:00Z'}}));
 assert.equal(checkMechanics('P07',calls,env).passed,true);assert.equal(checkMechanics('P07',[...calls,call('company_score',{}, {})],env).passed,false);
 calls[0].output.data.assessment.assessedAt='2026-11-10';assert.equal(checkMechanics('P07',calls,env).passed,false);
});
