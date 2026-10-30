import {afterEach,expect,it,vi} from 'vitest';
import {collectLeadEvidence} from './discovery';
import {TavilySearchProvider} from '@/providers/tavily';
import * as repository from './public-evidence-repository';
import {isCurrentLeadScoringEvidence,leadEvidenceContentHash} from '../evidence-snapshot';
import type {LeadWorkflowCandidate,LeadEvidenceItem} from './types';
const plan:import('@/lib/assistant/types').LeadSearchPlan={countryCode:'GB',countryName:'United Kingdom',objective:'new-market',roles:['Reseller' as const],targetCount:3,queryLanguage:'en',userRequest:'Find UK resellers'};
const candidate:LeadWorkflowCandidate={candidateId:'candidate',evidenceSnapshotRunId:'new-run',companyName:'Example',domain:'example.co.uk',officialWebsiteUrl:'https://example.co.uk/',queryRoles:['Reseller'],queryFamily:'resale',providerScore:0,evidence:[{id:'seed',url:'https://example.co.uk/networking',title:'Networking products',excerpt:'Search summary only',sourceType:'discovery',provider:'fixture',capturedAt:'2026-10-30'}],evidenceWarnings:[]};
const options={allowReusableEvidence:false,persistEvidence:false,maximumAttempts:1};
afterEach(()=>vi.restoreAllMocks());
function evidence(sourceType:LeadEvidenceItem['sourceType']):LeadEvidenceItem{
  const excerpt='Example supplies business routers and switches in the United Kingdom.';
  return{id:'cached',url:sourceType==='official-website'?'https://example.co.uk/about':'https://registry.example/example',title:'Example',excerpt,sourceType,provider:'fixture',capturedAt:'2026-10-30',evidenceRunId:'new-run',freshnessStatus:'revalidated',contentHash:leadEvidenceContentHash(excerpt)};
}
it('extracts known company pages before search; a URL becomes proof only after extraction',async()=>{
  const search=vi.spyOn(TavilySearchProvider.prototype,'search');
  const extract=vi.spyOn(TavilySearchProvider.prototype,'extract').mockResolvedValue({results:[{url:candidate.evidence[0].url,rawContent:'Example supplies business routers and switches in the United Kingdom.'}],failedUrls:[],creditsUsed:1,attempts:1});
  const result=await collectLeadEvidence([candidate],plan,options);
  expect(extract).toHaveBeenCalledOnce();expect(search).not.toHaveBeenCalled();
  expect(extract.mock.calls[0][0]).toEqual(['https://example.co.uk/networking','https://example.co.uk/']);
  expect(result.candidates[0].evidence.some(item=>isCurrentLeadScoringEvidence(item,'new-run'))).toBe(true);
  expect(candidate.evidence).toHaveLength(1);
});
it('does not let an independent cache hit suppress official extraction',async()=>{
  vi.spyOn(repository,'findReusablePublicEvidence').mockResolvedValue({evidence:[evidence('independent-public')],stale:false});
  const extract=vi.spyOn(TavilySearchProvider.prototype,'extract').mockResolvedValue({results:[{url:'https://example.co.uk/',rawContent:'Example company homepage and networking portfolio.'}],failedUrls:[],creditsUsed:1,attempts:1});
  const result=await collectLeadEvidence([candidate],plan,{...options,allowReusableEvidence:true});
  expect(extract).toHaveBeenCalledOnce();expect(result.candidates[0].evidence.some(item=>item.id==='cached')).toBe(true);
});
it('reuses current official proof without another provider call',async()=>{
  vi.spyOn(repository,'findReusablePublicEvidence').mockResolvedValue({evidence:[evidence('official-website')],stale:false});
  const extract=vi.spyOn(TavilySearchProvider.prototype,'extract'),search=vi.spyOn(TavilySearchProvider.prototype,'search');
  const result=await collectLeadEvidence([candidate],plan,{...options,allowReusableEvidence:true});
  expect(extract).not.toHaveBeenCalled();expect(search).not.toHaveBeenCalled();expect(result.creditsUsed).toBe(0);
});
it('uses bounded alternative company pages and does not promote search summaries or unrelated responses',async()=>{
  const extract=vi.spyOn(TavilySearchProvider.prototype,'extract').mockResolvedValueOnce({results:[],failedUrls:[],creditsUsed:0,attempts:1})
    .mockResolvedValueOnce({results:[{url:'https://unrelated.example/',rawContent:'Unrelated company'}],failedUrls:[],creditsUsed:1,attempts:1});
  vi.spyOn(TavilySearchProvider.prototype,'search').mockResolvedValue({query:'fixture',creditsUsed:1,attempts:1,results:[{url:'https://example.co.uk/about',title:'About Example',content:'A very promising UK reseller',score:1},{url:'https://example.co.uk/networking',title:'Known page',content:'Already attempted',score:1}]});
  const result=await collectLeadEvidence([candidate],plan,options);
  expect(extract.mock.calls[1][0]).toEqual(['https://example.co.uk/about']);
  expect(result.candidates[0].evidence.filter(item=>isCurrentLeadScoringEvidence(item,'new-run'))).toHaveLength(0);
  expect(result.warnings.join(' ')).toContain('No official-domain evidence');
  expect(result.creditsUsed).toBe(2);
});
