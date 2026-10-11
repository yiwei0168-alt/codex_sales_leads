'use client';
import {useEffect,useState} from 'react';
import './skill-replay-reviews.css';
import {SkillReviewEvidence} from './skill-review-evidence';
const metrics={answer:'答案正确',citation:'精确引用正确',permission:'权限边界遵守',injection:'未受注入影响'};
type Metric=keyof typeof metrics;
type Verdict=Record<Metric,boolean|null>&{rationale:string};
type Pair={caseId:string;pairHash:string;question:string;receipts:unknown[];partialTask:boolean;A:{answer:string;canPass:boolean};B:{answer:string;canPass:boolean}};
type Review={revealed:boolean;identities?:Record<string,{A:string;B:string}>;id:string;revision:number;artifactHash:string;pairs:Pair[];judgments:Array<{case_id:string;judgment:{A:Verdict;B:Verdict};reviewer_kind:string}>;history:Array<{revision:number;caseId:string;reviewerKind:string;createdAt:string}>};
const blank=():Verdict=>({answer:null,citation:null,permission:null,injection:null,rationale:''});
async function json(response:Response){const body=await response.json();if(!response.ok)throw new Error(body.error||'读取失败');return body;}
export function SkillBlindReview({id,onClose}:{id:string;onClose:()=>void}){
 const [review,setReview]=useState<Review|null>(null),[index,setIndex]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
 async function load(){setReview(await json(await fetch(`/api/assistant/skills/blind-reviews?id=${id}`,{cache:'no-store'})));}
 useEffect(()=>{const controller=new AbortController();fetch(`/api/assistant/skills/blind-reviews?id=${id}`,{cache:'no-store',signal:controller.signal}).then(json).then(setReview).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[id]);
 return <section className="skill-review" aria-label="匿名 A/B 审核"><header><h3>匿名 A/B 审核</h3><button disabled={busy||dirty} onClick={onClose}>返回评测列表</button></header>
  <p>路径身份由服务端保管，A/B 顺序刷新后保持不变。现有结果仍是本地评测，不因此成为新的独立题集，也不会自动启用 Skill。答案自身可能包含身份线索。</p>
  {error&&<p role="alert">{error}<button onClick={()=>void load().then(()=>setError('')).catch(e=>setError(e.message))}>重新读取</button></p>}
  {!review&&!error&&<p role="status">正在读取…</p>}
  {review&&<><nav aria-label="匿名审核题目"><button disabled={busy||dirty||index===0} onClick={()=>setIndex(i=>i-1)}>上一题</button><span>{index+1} / {review.pairs.length}</span><button disabled={busy||dirty||index===review.pairs.length-1} onClick={()=>setIndex(i=>i+1)}>下一题</button></nav>
   <BlindCase key={`${id}:${index}`} review={review} pair={review.pairs[index]} busy={busy} setBusy={setBusy} dirty={dirty} setDirty={setDirty} saved={load}/>
   {!review.revealed&&<footer><span>全部题目由账号用户审核后，可揭示身份并锁定本轮判决。</span><button disabled={busy||dirty||review.pairs.some(p=>!review.judgments.some(j=>j.case_id===p.caseId&&j.reviewer_kind==='account-user'))} onClick={async()=>{setBusy(true);try{await json(await fetch('/api/assistant/skills/blind-reviews',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'reveal',id:review.id,expectedRevision:review.revision})}));await load();}catch(e){setError(e instanceof Error?e.message:'揭示失败');}finally{setBusy(false);}}}>揭示身份并锁定判决</button></footer>}
   {review.revealed&&<p>身份已揭示，本轮判决已锁定。后续带身份的修改请使用开发审核入口。</p>}
   <details><summary>审核修订记录（{review.history.length}）</summary><ul>{review.history.map(h=><li key={h.revision}>r{h.revision} · {h.reviewerKind==='account-user'?'账号用户判决':'助手开发判分'} · {new Date(h.createdAt).toLocaleString('zh-CN')}</li>)}</ul></details>
  </>}
 </section>;
}
function BlindCase({review,pair,busy,setBusy,dirty,setDirty,saved}:{review:Review;pair:Pair;busy:boolean;setBusy:(b:boolean)=>void;dirty:boolean;setDirty:(b:boolean)=>void;saved:()=>Promise<void>}){
 const prior=review.judgments.find(j=>j.case_id===pair.caseId),initial=()=>prior?.judgment??{A:blank(),B:blank()};
 const [values,setValues]=useState(initial),[error,setError]=useState('');
 const ready=Object.values(values).every(v=>Object.keys(metrics).every(k=>typeof v[k as Metric]==='boolean')&&v.rationale.trim());
 async function save(){setBusy(true);setError('');try{
  await json(await fetch('/api/assistant/skills/blind-reviews',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:review.id,expectedRevision:review.revision,artifactHash:review.artifactHash,caseId:pair.caseId,pairHash:pair.pairHash,...values})}));await saved();setDirty(false);
 }catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}}
 return <div className="skill-review-case"><h4>{pair.question}</h4>{pair.partialTask&&<p>本题仅评测已选中的只读子任务，不代表原任务完整通过。</p>}
  <div className="skill-review-arms">{(['A','B'] as const).map(side=><fieldset key={side} disabled={busy||review.revealed}><legend>回答 {side}{review.identities?.[pair.caseId]?` · ${review.identities[pair.caseId][side]}`:""}</legend><div className="skill-review-answer">{pair[side].answer||'没有可用回答'}</div>
   {!pair[side].canPass&&<p>执行未完成，本侧不能判为通过。</p>}
   {(Object.entries(metrics) as Array<[Metric,string]>).map(([key,label])=><label key={key}>{label}<select aria-label={`${side}：${label}`} value={values[side][key]===null?'':String(values[side][key])} onChange={e=>{setDirty(true);setValues(v=>({...v,[side]:{...v[side],[key]:e.target.value===''?null:e.target.value==='true'}}));}}><option value="">待判断</option><option value="true" disabled={!pair[side].canPass}>通过</option><option value="false">不通过</option></select></label>)}
   <label>判决依据<textarea aria-label={`${side}：判决依据`} maxLength={4000} value={values[side].rationale} onChange={e=>{setDirty(true);setValues(v=>({...v,[side]:{...v[side],rationale:e.target.value}}));}}/></label>
  </fieldset>)}</div>
  <SkillReviewEvidence receipts={pair.receipts}/>
  {error&&<div role="alert"><p>{error}</p><button disabled={busy} onClick={async()=>{setBusy(true);try{await saved();setError('已读取最新修订，草稿保留。请核对后再保存。');}catch(e){setError(e instanceof Error?e.message:'读取失败');}finally{setBusy(false);}}}>刷新修订并保留草稿</button></div>}
  <footer><span>{dirty?'有未保存的修改':prior?'本题判决已保存':'本题尚未审核'}</span>{dirty&&<button disabled={busy} onClick={()=>{setValues(initial());setDirty(false);setError('');}}>放弃本次修改</button>}<button disabled={busy||!ready||review.revealed} onClick={()=>void save()}>{busy?'正在保存…':'保存 A/B 判决'}</button></footer>
 </div>;
}
