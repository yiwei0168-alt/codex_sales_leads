import {expect,it} from 'vitest';
import {digest} from './contracts';
import {prepareSkillReview,gradeSkillReplay} from './skill-replay-review';

function fixture(){
  const files={'SKILL.md':'Read evidence'},id='00000000-0000-4000-8000-000000000001';
  const suite={id:'review-test',ownerId:id,skill:{id,version:1,files,contentHash:digest(files),sourceHash:digest('source')},
    model:{name:'qwen3:8b',digest:digest('model')},cases:[{id:'case1',category:'replay',provenance:'synthetic',question:'Read evidence',receipts:[]}]};
  const pair={caseId:'case1',caseHash:digest(suite.cases[0]),baseline:{status:'completed',answer:'original'},candidate:{status:'completed',answer:'candidate'}};
  const result={protocol:'skill-paired-replay-v2',suiteHash:digest(suite),promptHash:digest('prompt'),configHash:digest('config'),
    artifactHash:digest([pair]),pairs:[pair],autoEnable:false,productionAgentEquivalent:false};
  const review={...prepareSkillReview(suite,result),reviews:[{caseId:'case1',pairHash:digest(pair),reviewer:'local-reviewer',
    baseline:{answer:true,citation:true,permission:true,injection:true,rationale:'Verified'},
    candidate:{answer:true,citation:true,permission:true,injection:true,rationale:'Verified'}}]};
  return {suite,result,review};
}
it('produces ungraded templates, never default passes',()=>{
  const {suite,result}=fixture();expect(prepareSkillReview(suite,result).reviews[0].candidate.answer).toBeNull();
});
it('passing development reviews cannot authorize production activation',()=>{
  const {suite,result,review}=fixture(),grade=gradeSkillReplay(suite,result,review);
  expect(grade.developmentComparisonPassed).toBe(true);expect(grade.autoEnable).toBe(false);expect(grade.blockers).toHaveLength(3);
});
it('missing judgments stay incomplete',()=>{
  const {suite,result,review}=fixture();review.reviews=[];
  expect(gradeSkillReplay(suite,result,review)).toMatchObject({complete:false,developmentComparisonPassed:false});
});
it('reports per-case regression and safety failure',()=>{
  const {suite,result,review}=fixture();review.reviews[0].candidate.permission=false;
  expect(gradeSkillReplay(suite,result,review)).toMatchObject({regressions:['case1:permission'],safetyPassed:false,developmentComparisonPassed:false});
});
it('rejects duplicate judgments',()=>{
  const {suite,result,review}=fixture();review.reviews.push(review.reviews[0]);
  expect(()=>gradeSkillReplay(suite,result,review)).toThrow('Duplicate');
});
it.each(['suite','result','pair'])('rejects changed %s binding',key=>{
  const {suite,result,review}=fixture();
  if(key==='suite')suite.skill.version++;
  if(key==='result')result.promptHash=digest('new prompt');
  if(key==='pair')result.pairs[0].candidate.answer='changed';
  expect(()=>gradeSkillReplay(suite,result,review)).toThrow();
});
it('does not accept passing judgments for failed arms',()=>{
  const {suite,result,review}=fixture();result.pairs[0].candidate.status='blocked';result.artifactHash=digest(result.pairs);
  review.resultHash=digest(result);review.reviews[0].pairHash=digest(result.pairs[0]);
  expect(()=>gradeSkillReplay(suite,result,review)).toThrow('Incomplete or blocked');
});
it('labels cannot convert a local artifact into production evidence',()=>{
  const {suite,result,review}=fixture();
  expect(()=>gradeSkillReplay(suite,{...result,productionAgentEquivalent:true},review)).toThrow();
});
