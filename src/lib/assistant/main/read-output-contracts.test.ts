import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({assessment:vi.fn()}));
vi.mock('@/lib/sales/company-detail-read',()=>({readSavedCompanyAssessment:m.assessment,listCompanyCorrespondence:vi.fn()}));
import {businessTools} from './business-tools';
import {describeTool,productTools} from './tools';
import {result} from './contracts';
import {companySearchOutput,knowledgeSearchOutput,knowledgeFactsOutput} from './read-output-contracts';
const tool=businessTools.find(t=>t.id==='company_assessment_read')!;
const context={userId:'owner',runId:'run',leaseToken:'lease',role:'member' as const};
beforeEach(()=>vi.clearAllMocks());
it('passes the selected sales ID unchanged and preserves assessment time and a usable authenticated source',async()=>{
 const assessment={totalScore:88,assessedAt:'2026-10-31 12:00:00+00',policyVersion:'historical',evidence:[{url:'fixture://source'}],extra:'retained'};
 m.assessment.mockResolvedValue(assessment);
 const output=tool.output.parse(await tool.execute({companyExternalId:'sales/id with space'},context));
 expect(m.assessment).toHaveBeenCalledWith('owner','sales/id with space');
 expect(output.data).toEqual({assessment});
 expect(output.sources[0].url).toBe('/api/workspaces/current/companies/sales%2Fid%20with%20space/assessment');
 expect(tool.input.safeParse({companyExternalId:'sales',userId:'other'}).success).toBe(false);
});
it('does not fabricate a score, date or source link for a missing assessment',async()=>{
 m.assessment.mockResolvedValue(null);
 expect(tool.output.parse(await tool.execute({companyExternalId:'missing'},context))).toMatchObject({status:'missing_input',data:{assessment:null},sources:[]});
});
it('describes separate sales and mailbox ID paths before code generation',()=>{
 const schema=JSON.stringify(describeTool(productTools.find(t=>t.id==='company_search')!).outputSchema);
 expect(schema).toContain('company_assessment_read.companyExternalId');
 const data={companies:[{id:'sales',name:'One',domain:'one.test',countryCode:'GB'}],hasMore:false,
  mailboxCustomers:{items:[{id:'mail',name:'One',domain:'one.test',country:null,confirmed:false}],hasMore:false},
  matching:{requiresSelection:true,mailboxTimelineUnambiguous:false,guidance:'No merge'},extra:'preserved'};
 expect(companySearchOutput.parse(result(data)).data).toEqual(data);
});
it('exposes actual evidence arrays without erasing original metadata or converting missing facts to zero',()=>{
 const chunk={id:'chunk',documentId:'doc',title:'Spec',content:'Original',collection:'product',metadata:{assetId:'asset',version:'v2',custom:{x:1}},sourceUrl:'/api/knowledge/assets/asset',custom:'keep'};
 expect(knowledgeSearchOutput.parse(result([chunk])).data).toEqual([chunk]);
 expect(knowledgeSearchOutput.safeParse(result({chunks:[chunk]})).success).toBe(false);
 const fact={id:'fact',attributeKey:'ethernet_port_count',typedValue:16,rawValue:'16',unit:null,status:'verified',polarity:'positive',assetId:'asset',documentVersion:null,chunkId:'chunk'};
 expect(knowledgeFactsOutput.parse(result([fact])).data).toEqual([fact]);
 expect(knowledgeFactsOutput.parse(result([])).data).toEqual([]);
});
