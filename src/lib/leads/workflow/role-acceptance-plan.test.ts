import {expect,it} from 'vitest';
import {buildRoleAcceptancePlans} from './role-acceptance-plan';
import {normalizeLeadSearchPlan,buildHybridSearchRoute} from './hybrid-search-policy';
it('retains every explicit role through production normalization with independent targets',()=>{
 const plans=buildRoleAcceptancePlans({countryCode:'GB',countryName:'United Kingdom',targetPerRole:3,userRequest:'Search all channel types, three companies for each.'});
 expect(plans).toHaveLength(13);expect(new Set(plans.flatMap(p=>p.roles)).size).toBe(13);
 expect(plans.reduce((n,p)=>n+p.targetCount,0)).toBe(39);
 for(const plan of plans){const normalized=normalizeLeadSearchPlan(plan);expect(normalized.roles).toEqual(plan.roles);expect(normalized.targetCount).toBe(3);expect(buildHybridSearchRoute(plan).length).toBeGreaterThan(0);expect(normalized.opportunityTargets).toEqual([]);}
});
it('rejects ambiguous country codes and invalid targets rather than creating partial batches',()=>{
 for(const change of [{countryCode:'UK1'},{targetPerRole:0},{targetPerRole:101}])expect(()=>buildRoleAcceptancePlans({countryCode:'GB',countryName:'United Kingdom',targetPerRole:3,userRequest:'All types',...change})).toThrow();
});
