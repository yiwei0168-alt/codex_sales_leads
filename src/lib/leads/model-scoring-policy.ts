import { ACTIVE_LEAD_SCORING_POLICY, type LeadScoringPolicy } from './scoring-policy';

export const MODEL_SCORING_PROJECTION_VERSION = 'model-scoring-policy-v1';
const knownKeys = ['policyKey','version','schemaVersion','status','weights','productAndUseCaseFit',
  'productTracks','roleScorecards','subweights','researchPolicy','evidenceFreshnessDays',
  'eligibilityPolicy','escalationPolicy','accountTierPolicy','knowledgePolicy'];

/** Full source remains authoritative for persistence and deterministic account calculation. */
export function projectModelScoringPolicy(policy: LeadScoringPolicy) {
  if (Object.keys(policy).some(key => !knownKeys.includes(key))) {
    throw new Error('Unclassified scoring policy field; review model projection before use');
  }
  if(Object.keys(policy.accountTierPolicy).some(key=>!['tier1Distribution','downstream','kaScope',
    'strategicThreshold','priorityThreshold','thresholdsConfigurable','doesNotAffectScore'].includes(key))) {
    throw new Error('Unclassified account tier field; review model projection before use');
  }
  const { schemaVersion, status, accountTierPolicy, ...semantic } = policy;
  void schemaVersion; void status;
  return { ...semantic, accountTierPolicy: {
    kaScope: accountTierPolicy.kaScope,
    doesNotAffectScore: accountTierPolicy.doesNotAffectScore,
  } };
}

export const MODEL_SCORING_POLICY = projectModelScoringPolicy(ACTIVE_LEAD_SCORING_POLICY);
