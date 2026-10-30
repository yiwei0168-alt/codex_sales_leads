import {expect,it} from 'vitest';
import {buildStrategyAcceptancePlans} from './role-acceptance-plan';
import {normalizeLeadSearchPlan,buildHybridSearchRoute} from './hybrid-search-policy';
const input={countryCode:'GB',countryName:'United Kingdom',targetPerGroup:3,userRequest:'Search UK channel groups, three per group.'};
it('uses six merged production categories without subtype quotas or conditional categories',()=>{
 const cases=buildStrategyAcceptancePlans(input);
 expect(cases.map(c=>c.plan.roles)).toEqual([['Distributor','VAD'],['VAR','Dealer','Reseller'],['Retailer','E-tailer'],['SI','MSP'],['Installer'],['ISP']]);
 expect(cases.reduce((n,c)=>n+c.plan.targetCount,0)).toBe(18);
 for(const c of cases){expect(normalizeLeadSearchPlan(c.plan)).toEqual(c.plan);
  expect(new Set(buildHybridSearchRoute(c.plan).map(s=>s.category))).toEqual(new Set([c.category]));
  expect(c.plan.opportunityTargets).toEqual([]);expect(c.plan.coverageMode).toBe('auto');}
});
it('preserves market-dependent tracks instead of forcing mixed coverage',()=>{
 const uk=buildStrategyAcceptancePlans(input),mx=buildStrategyAcceptancePlans({...input,countryCode:'MX',countryName:'Mexico'});
 expect(uk.find(c=>c.category==='retail')?.tracks).toEqual(['etail','retail-national']);
 expect(mx.find(c=>c.category==='retail')?.tracks).toEqual(['etail','retail-national','retail-local']);
 expect(uk.find(c=>c.category==='resale')?.tracks).toEqual(['national-b2b','local-b2b']);
 expect(uk.find(c=>c.category==='si-msp')?.tracks).toEqual(['national-complex','local-smb']);
});
it('rejects invalid input and the superseded per-role target field',()=>{
 for(const change of [{countryCode:'UK1'},{targetPerGroup:0},{targetPerGroup:101},{targetPerRole:3}])expect(()=>buildStrategyAcceptancePlans({...input,...change})).toThrow();
});
