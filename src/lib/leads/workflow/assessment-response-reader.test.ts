import{expect,it}from'vitest';import{leadAssessmentModelSchema,leadAssessmentResponseModelSchema,leadAssessmentResponseScoreOnlySchema,assessmentExplanationCharacters,cachedLeadAssessmentSchema}from'./schemas';
const reason='Evidence supports this networking product and its documented customer scenario. ';
function output(){return{candidateId:'lead-fixture',gates:{correctedIdentityUsable:'supported',companyExists:'supported',targetCountryPresence:'unknown',networkingRelevant:'supported',independentProspect:'unknown'},eligibilityStatus:'research-required',companyScaleClass:'Unknown',researchDepth:'standard',supplyModel:'TBD',brandInvolvement:'Standard',dimensions:{productFamilyMatch:20,customerAndScenarioOverlap:10,positioningCompatibility:7,cooperationPathAndBuyingInfluence:8,scaleAndChannelCoverage:8,executionAndEnablement:6,opportunityAndRisk:6},dimensionRationales:['productFamilyMatch','customerAndScenarioOverlap','positioningCompatibility','cooperationPathAndBuyingInfluence','scaleAndChannelCoverage','executionAndEnablement','opportunityAndRisk'].map(dimension=>({dimension,score:8,reason:reason.repeat(7),findingIds:['finding-one'],evidenceIds:['source-one'],confidence:70})),confidence:70,summary:reason.repeat(6),reasons:['Public networking assortment'],risks:[],unknowns:['UK-specific product availability'],evidenceIds:['source-one'],escalation:{required:false,expectedTotalScoreChange:0,criticalStateChanges:[],higherCapabilityCanResolve:false,reason:reason.repeat(5)},warnings:[],cooperationPaths:[],selectedPathId:null};}
it('keeps generation concise while reading complete bounded explanations verbatim',()=>{
 const value=output(),before=JSON.stringify(value);expect(leadAssessmentModelSchema.safeParse(value).success).toBe(false);
 const parsed=leadAssessmentResponseModelSchema.parse(value);expect(parsed.summary).toBe(value.summary);
 expect(parsed.dimensionRationales.map(x=>x.reason)).toEqual(value.dimensionRationales.map(x=>x.reason));
 expect(parsed.gates.targetCountryPresence).toBe('unknown');expect(assessmentExplanationCharacters(parsed)).toBeLessThan(12000);
 expect(JSON.stringify(value)).toBe(before);expect(leadAssessmentResponseScoreOnlySchema.safeParse(value).success).toBe(true);
});
it('keeps numeric, identity, role, cardinality and text-size failures invalid',()=>{
 for(const value of [{...output(),candidateId:''},{...output(),gates:{...output().gates,targetCountryPresence:'certain'}},{...output(),dimensions:{...output().dimensions,productFamilyMatch:26}},{...output(),dimensionRationales:output().dimensionRationales.slice(1)},{...output(),summary:'x'.repeat(2001)}])expect(leadAssessmentResponseModelSchema.safeParse(value).success).toBe(false);
});
it('accepts retained full explanations in normalized cache records without accepting a wrong numeric score',()=>{
 const value=leadAssessmentResponseModelSchema.parse(output());const base=leadAssessmentResponseModelSchema.omit({escalation:true}).parse(value);
 const cached={...base,eligible:false,roles:['E-tailer'],primaryRole:'E-tailer',totalScore:65,scoreRange:{lower:60,upper:70},recommendationPriority:'Hold/Research Required',accountTier:'Standard',model:'deepseek-v4-pro',promptVersion:'fixture',escalated:false,scoringStatus:'completed'};
 expect(cachedLeadAssessmentSchema.safeParse(cached).success).toBe(true);
 expect(cachedLeadAssessmentSchema.safeParse({...cached,totalScore:101}).success).toBe(false);
});
