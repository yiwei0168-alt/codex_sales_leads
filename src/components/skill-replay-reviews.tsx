'use client';
import {useEffect,useState} from 'react';
import './skill-replay-reviews.css';

const metrics={answer:'答案正确',citation:'精确引用正确',permission:'权限边界遵守',injection:'未受注入影响'};
type Metric=keyof typeof metrics;
type Verdict=Record<Metric,boolean|null>&{rationale:string};
type Row={caseId:string;pairHash:string;reviewer?:string|null;baseline:Verdict;candidate:Verdict};
type Evaluation={id:string;revision:number;review:{suiteHash:string;resultHash:string;reviews:Row[]};
  snapshot:{suite:{cases:Array<{id:string;question:string;receipts:unknown[]}>}};
  result:{pairs:Array<{caseId:string;baseline:{status:string;answer?:string;reply?:string};candidate:{status:string;answer?:string;reply?:string}}>}};
const blank=():Verdict=>({answer:null,citation:null,permission:null,injection:null,rationale:''});

async function json(response:Response){const data=await response.json();if(!response.ok)throw new Error(data.error||'读取失败，请重试');return data;}

export function SkillReplayReviews({skillId,name,onClose}:{skillId:string;name:string;onClose:()=>void}){
  const [items,setItems]=useState<Array<{id:string;version:number;created_at:string}>>([]),[offset,setOffset]=useState(0),[more,setMore]=useState(false);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState<Evaluation|null>(null),[busy,setBusy]=useState(false),[index,setIndex]=useState(0);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/assistant/skills/reviews?skillId=${skillId}&offset=${offset}`,{signal:controller.signal,cache:'no-store'}).then(json)
      .then(data=>{if(!controller.signal.aborted){setItems(data.items);setMore(data.hasMore);setLoading(false);}})
      .catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
    return()=>controller.abort();
  },[skillId,offset]);
  async function open(id:string){
    setBusy(true);setError('');setSelected(null);
    try{setSelected(await json(await fetch(`/api/assistant/skills/reviews?id=${id}`,{cache:'no-store'})));setIndex(0);}
    catch(e){setError(e instanceof Error?e.message:'读取失败');}finally{setBusy(false);}
  }
  return <section className="skill-review" aria-label="Skill 评测审核">
    <header><h3>{name} · 评测审核</h3><button type="button" disabled={busy||dirty} onClick={onClose}>返回 Skill</button></header>
    <p>逐题核对双方回答及原始证据。这里审核历史回放，不会自动启用方法。</p>
    {error&&<p role="alert">{error}</p>}
    {selected?<>
      <nav aria-label="审核题目"><button type="button" disabled={busy||dirty||index===0} onClick={()=>setIndex(i=>i-1)}>上一题</button>
        <span>{index+1} / {selected.result.pairs.length}</span>
        <button type="button" disabled={busy||dirty||index===selected.result.pairs.length-1} onClick={()=>setIndex(i=>i+1)}>下一题</button>
        <button type="button" disabled={busy||dirty} onClick={()=>setSelected(null)}>返回评测列表</button></nav>
      <ReviewCase key={`${selected.id}:${index}:${selected.revision}`} evaluation={selected} index={index} busy={busy} setBusy={setBusy}
        dirty={dirty} setDirty={setDirty} onSaved={async()=>{const updated=await json(await fetch(`/api/assistant/skills/reviews?id=${selected.id}`,{cache:'no-store'}));setSelected(updated);setDirty(false);}}/>
    </>:<>
      {(loading||busy)&&<p role="status">正在读取…</p>}
      {!loading&&!busy&&!items.length&&!error&&<p>还没有可审核的历史回放。完成回放后会在这里列出，未经审核的答案不会默认通过。</p>}
      <ul>{items.map(item=><li key={item.id}><span>v{item.version} · {new Date(item.created_at).toLocaleString('zh-CN')}</span>
        <button type="button" disabled={busy} onClick={()=>void open(item.id)}>打开审核</button></li>)}</ul>
      <nav><button type="button" disabled={loading||busy||offset===0} onClick={()=>{setLoading(true);setOffset(o=>o-12);}}>上一页</button>
        <span>第 {offset/12+1} 页</span><button type="button" disabled={loading||busy||!more} onClick={()=>{setLoading(true);setOffset(o=>o+12);}}>下一页</button></nav>
    </>}
  </section>;
}

function ReviewCase({evaluation,index,busy,setBusy,onSaved,dirty,setDirty}:{evaluation:Evaluation;index:number;busy:boolean;setBusy:(v:boolean)=>void;onSaved:()=>Promise<void>;dirty:boolean;setDirty:(v:boolean)=>void}){
  const pair=evaluation.result.pairs[index],item=evaluation.snapshot.suite.cases.find(c=>c.id===pair.caseId)!;
  const prior=evaluation.review.reviews.find(r=>r.caseId===pair.caseId);
  const [values,setValues]=useState({baseline:prior?.baseline??blank(),candidate:prior?.candidate??blank()}),[error,setError]=useState('');
  // pairHash comes from the server template even when no judgment has been saved yet.
  const ready=Object.values(values).every(v=>Object.keys(metrics).every(k=>typeof v[k as Metric]==='boolean')&&v.rationale.trim());
  async function save(){
    setBusy(true);setError('');
    try{
      await json(await fetch('/api/assistant/skills/reviews',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        id:evaluation.id,expectedRevision:evaluation.revision,suiteHash:evaluation.review.suiteHash,resultHash:evaluation.review.resultHash,
        judgment:{caseId:pair.caseId,pairHash:prior?.pairHash,...values}})}));
      await onSaved();
    }catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}
  }
  return <div className="skill-review-case" onChange={()=>setDirty(true)}><h4>{item.question}</h4>
    <div className="skill-review-arms">{(['baseline','candidate'] as const).map(side=><fieldset key={side} disabled={busy}>
      <legend>{side==='baseline'?'原流程':'候选 Skill'}</legend>
      <div className="skill-review-answer">{pair[side].reply??pair[side].answer??'没有可用回答'}</div>
      {pair[side].status!=='completed'&&<p>执行未完成，本侧不能判为通过。</p>}
      {(Object.entries(metrics) as Array<[Metric,string]>).map(([key,label])=><label key={key}>{label}<select aria-label={`${side==='baseline'?'原流程':'候选 Skill'}：${label}`}
        value={values[side][key]===null?'':String(values[side][key])} onChange={e=>setValues(v=>({...v,[side]:{...v[side],[key]:e.target.value===''?null:e.target.value==='true'}}))}>
        <option value="">待判断</option><option value="true" disabled={pair[side].status!=='completed'}>通过</option><option value="false">不通过</option></select></label>)}
      <label>判决依据<textarea aria-label={`${side==='baseline'?'原流程':'候选 Skill'}：判决依据`} maxLength={4000} value={values[side].rationale}
        onChange={e=>setValues(v=>({...v,[side]:{...v[side],rationale:e.target.value}}))}/></label>
    </fieldset>)}</div>
    <details><summary>查看本题原始证据与来源坐标</summary><pre>{JSON.stringify(item.receipts,null,2)}</pre></details>
    {error&&<p role="alert">{error}</p>}
    <footer><span>{dirty?'有未保存的修改，请保存或放弃后切换题目。':prior?.reviewer?'本题判决已保存；再次保存会保留旧记录。':'本题判决尚未保存'}</span>
      {dirty&&<button type="button" disabled={busy} onClick={()=>{setValues({baseline:prior?.baseline??blank(),candidate:prior?.candidate??blank()});setDirty(false);setError('');}}>放弃本次修改</button>}
      <button type="button" disabled={busy||!ready} onClick={()=>void save()}>{busy?'正在保存…':'保存本题判决'}</button></footer>
  </div>;
}
