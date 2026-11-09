import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MODEL,VERSION,atomicResponseSchema,buildAtomicRequest,atomicRoute,type AtomicPolicy,type AtomicResponse} from './contract';
import {selectPolicy} from './evaluation';
import {once} from './receipts';
import {validDecisionRequest} from '../../src/providers/decision-contract';

function answer(choice:'yes'|'no'|'unclear'){
  return {type:'choice' as const,choice,probabilities:{yes:choice==='yes'?0.9:0.05,no:choice==='no'?0.9:0.05,
    unclear:choice==='unclear'?0.9:0.05},confidence:0.8};
}
function response(route:'fixed_workflow'|'interpreter'|'dynamic_agent'):AtomicResponse{return {id:'synthetic-test',model:MODEL,
  answers:{requires_planning:answer(route==='dynamic_agent'?'yes':'no'),fixed_fit:answer(route==='fixed_workflow'?'yes':'no'),
    batch_fit:answer(route==='interpreter'?'yes':'no')},usage:{input_tokens:1,output_tokens:1}};}
const policy:AtomicPolicy={version:'test',contractVersion:VERSION,routes:{fixed_workflow:{enabled:true,probability:0.8,margin:0.6},
  interpreter:{enabled:true,probability:0.8,margin:0.6}}};
describe('atomic Jev experiment',()=>{
  it('keeps full input, uses three independent questions and remains excluded from the production wire contract',()=>{
    const state={request:'查询 Acme 进展，并起草邮件；不要丢掉后半句。',hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false};
    const request=buildAtomicRequest(state);expect(request.state).toEqual(state);expect(Object.keys(request.questions)).toHaveLength(3);
    expect(request.provider.allow_fallbacks).toBe(false);expect(validDecisionRequest(request)).toBe(false);
  });
  it.each(['hasHistory','hasAttachments','hasPolicy','hasKnowledgeScope'])('rejects restricted context %s',key=>{
    expect(()=>buildAtomicRequest({request:'x',hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false,[key]:true})).toThrow();
  });
  it.each(['fixed_workflow','interpreter','dynamic_agent'] as const)('combines independent decisions for %s',route=>{
    expect(atomicRoute(atomicResponseSchema.parse(response(route)),policy)).toBe(route);
  });
  it('falls back on conflicting fits, uncertain scope and disabled policy',()=>{
    const r=response('fixed_workflow');r.answers.batch_fit=answer('yes');expect(atomicRoute(r,policy)).toBe('dynamic_agent');
    r.answers.batch_fit=answer('no');r.answers.requires_planning=answer('unclear');expect(atomicRoute(r,policy)).toBe('dynamic_agent');
    const disabled=structuredClone(policy);disabled.routes.fixed_workflow.enabled=false;
    expect(atomicRoute(response('fixed_workflow'),disabled)).toBe('dynamic_agent');
  });
  it('requires every contributing answer to pass and handles exact decimal boundaries',()=>{
    const r=response('fixed_workflow');r.answers.requires_planning={...answer('no'),probabilities:{yes:0.45,no:0.5,unclear:0.05}};
    expect(atomicRoute(r,policy)).toBe('dynamic_agent');
    const edge=structuredClone(policy);edge.routes.fixed_workflow={enabled:true,probability:0.5,margin:0.05};
    expect(atomicRoute(r,edge)).toBe('fixed_workflow');edge.routes.fixed_workflow.probability=NaN;
    expect(atomicRoute(r,edge)).toBe('dynamic_agent');
  });
  it('rejects missing answers, foreign models, errors and invalid distributions',()=>{
    const r=response('fixed_workflow');
    expect(atomicResponseSchema.safeParse({...r,answers:{fixed_fit:r.answers.fixed_fit}}).success).toBe(false);
    expect(atomicResponseSchema.safeParse({...r,model:'another/model'}).success).toBe(false);
    expect(atomicResponseSchema.safeParse({...r,error:'oops'}).success).toBe(false);
    r.answers.fixed_fit.probabilities.yes=0.2;expect(atomicResponseSchema.safeParse(r).success).toBe(false);
  });
  it('calibrates on complete development data and disables a route when every positive conflicts with negatives',()=>{
    const rows=Array.from({length:48},(_,i)=>{const expected=i<12?'fixed_workflow':i<24?'interpreter':'dynamic_agent';
      return {sample:{id:`D${String(i+1).padStart(2,'0')}`,request:`dev ${i}`,expected} as const,response:response(expected)};});
    const selected=selectPolicy(rows);expect(selected.routes.fixed_workflow.enabled).toBe(true);
    expect(selected.routes.fixed_workflow.probability).toBe(0.9);expect(()=>selectPolicy(rows.slice(1))).toThrow();
    rows[24].response=response('fixed_workflow');expect(selectPolicy(rows).routes.fixed_workflow.enabled).toBe(false);
  });
  it('reuses successful receipts without another call and detects identity drift',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'jev-once-'));try{
      const path=join(dir,'one.json'),call=vi.fn(async()=>response('fixed_workflow'));
      expect((await once(path,'a',call)).status).toBe('completed');await once(path,'a',call);expect(call).toHaveBeenCalledTimes(1);
      await expect(once(path,'b',call)).rejects.toThrow('identity');
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('never retries started or failed calls and writes start before transport',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'jev-once-'));try{
      const path=join(dir,'one.json');await writeFile(path,JSON.stringify({identity:'a',status:'started'}));
      const call=vi.fn(async()=>null);expect((await once(path,'a',call)).status).toBe('started');expect(call).not.toHaveBeenCalled();
      const other=join(dir,'other.json'),fail=vi.fn(async()=>{expect(JSON.parse(await readFile(other,'utf8')).status).toBe('started');throw Error('timeout');});
      expect((await once(other,'b',fail)).status).toBe('failed-or-unknown');await once(other,'b',fail);expect(fail).toHaveBeenCalledTimes(1);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
});
