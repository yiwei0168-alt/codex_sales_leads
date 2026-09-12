import { describe, expect, it } from 'vitest';
import { ACTIVE_LEAD_SCORING_POLICY, scoringPolicyChecksum } from './scoring-policy';
import { projectModelScoringPolicy } from './model-scoring-policy';

describe('model scoring policy projection', () => {
  it('preserves all semantic fields and all roles/tracks without mutating source', () => {
    const before=scoringPolicyChecksum();const model=projectModelScoringPolicy(ACTIVE_LEAD_SCORING_POLICY);
    for(const [key,value] of Object.entries(ACTIVE_LEAD_SCORING_POLICY)) {
      if(!['schemaVersion','status','accountTierPolicy'].includes(key))expect(model).toHaveProperty(key,value);
    }
    expect(model.accountTierPolicy).toEqual({kaScope:ACTIVE_LEAD_SCORING_POLICY.accountTierPolicy.kaScope,doesNotAffectScore:true});
    expect(model.accountTierPolicy).not.toHaveProperty('priorityThreshold');
    expect(ACTIVE_LEAD_SCORING_POLICY.accountTierPolicy.priorityThreshold).toBe(75);
    expect(scoringPolicyChecksum()).toBe(before);
  });
  it('rejects unclassified new fields instead of silently dropping them', () => {
    const futurePolicy={...ACTIVE_LEAD_SCORING_POLICY,newRule:true};
    expect(()=>projectModelScoringPolicy(futurePolicy)).toThrow('Unclassified');
  });
});
