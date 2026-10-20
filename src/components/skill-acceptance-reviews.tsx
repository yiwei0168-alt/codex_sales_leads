'use client';
import {useEffect,useRef,useState} from 'react';
import type {listSkillAcceptanceReviews,readSkillAcceptanceReview,readSkillAcceptanceReviewCase} from '@/lib/assistant/main/skill-acceptance-review';
import {SkillReviewEvidence} from './skill-review-evidence';
import {SkillAcceptanceOriginals} from './skill-acceptance-originals';
import './skill-replay-reviews.css';
type Summary=Awaited<ReturnType<typeof readSkillAcceptanceReview>>;
type Material=Awaited<ReturnType<typeof readSkillAcceptanceReviewCase>>;
type List=Awaited<ReturnType<typeof listSkillAcceptanceReviews>>;
const endpoint='/api/assistant/skills/acceptance-reviews';
const metrics={answer:'答案正确',citation:'精确引用正确',permission:'权限边界遵守',injection:'未受注入影响'};
const names={replay:'历史回放',negative:'错误案例',injection:'注入防护',permissions:'权限检查',shadow:'实时影子'};
const states={active:'冻结有效',revoked:'冻结已撤销',expired:'冻结已到期',missing:'冻结记录缺失',changed:'冻结内容已变化','not-recorded':'未登记冻结'};
type Verdict=Record<keyof typeof metrics,boolean|null>;
const blank=():Verdict=>({answer:null,citation:null,permission:null,injection:null});
const judgmentValues=(judgment:Summary['cases'][number]['judgment'])=>({baseline:judgment?.baseline??blank(),candidate:judgment?.candidate??blank(),rationale:judgment?.rationale??''});
async function json<T>(response:Response):Promise<T>{const value=await response.json();if(!response.ok)throw new Error(value.error||'读取失败，请重试');return value;}
export function SkillAcceptanceReviews({skillId,name,onClose}:{skillId:string;name:string;onClose:()=>void}){
 const [offset,setOffset]=useState(0),[items,setItems]=useState<List>({items:[],hasMore:false}),[selected,setSelected]=useState<Summary|null>(null),[caseId,setCaseId]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{const controller=new AbortController();
  fetch(`${endpoint}?skillId=${encodeURIComponent(skillId)}&offset=${offset}`,{signal:controller.signal,cache:'no-store'}).then(json<List>)
   .then(value=>{if(!controller.signal.aborted){setItems(value);setLoading(false);}}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
  return()=>controller.abort();
 },[skillId,offset,refresh]);
 async function open(id:string){setBusy(true);setError('');try{const value=await json<Summary>(await fetch(`${endpoint}?id=${id}`,{cache:'no-store'}));setSelected(value);setCaseId(value.cases[0]?.id??'');}catch(e){setError(e instanceof Error?e.message:'读取失败');}finally{setBusy(false);}}
 return <section className="skill-review skill-acceptance" aria-label="Skill 验收审核">
  <header><h3>{name} · 验收审核</h3><button disabled={busy||dirty} onClick={onClose}>返回 Skill</button></header>
  <p>核对双方答案与保存的来源后逐项判决。保存审核不会启用 Skill。</p>
  {error&&<p role="alert">{error}</p>}
  {selected?<>
   <nav aria-label="验收题目"><label>题目 <select disabled={busy||dirty} value={caseId} onChange={e=>setCaseId(e.target.value)}>{selected.cases.map((row,index)=><option key={row.id} value={row.id}>{index+1}. {names[row.category]} · {row.id}{row.hasObservation?'':'（未采集）'}</option>)}</select></label>
    <button disabled={busy||dirty} onClick={()=>setSelected(null)}>返回验收列表</button></nav>
   <p>{selected.sourceKind==='synthetic-fixture'?'合成测试材料':'生产采集材料（尚未通过完整验收）'}；{states[selected.freezeStatus.state]}。{!selected.sourcesCurrent&&'Skill 来源已变化。'}</p>
   <SkillAcceptanceOriginals key={selected.id} bundleId={selected.id} disabled={busy||dirty} setBusy={setBusy}/>
   {selected.cases.find(row=>row.id===caseId)&&<AcceptanceCase key={`${selected.id}:${caseId}`} summary={selected} item={selected.cases.find(row=>row.id===caseId)!} setBusy={setBusy} setDirty={setDirty}/>}
  </>:<>
   {(loading||busy)&&<p role="status">正在读取…</p>}
   {!loading&&!items.items.length&&!error&&<p>暂无验收材料。完成采集后会列在这里，未采集项目不会默认通过。</p>}
   <ul>{items.items.map(row=><li key={row.id}><span>v{row.version} · {new Date(row.createdAt).toLocaleString('zh-CN')} · {row.caseCount} 道已采集题目</span><button disabled={busy} onClick={()=>void open(row.id)}>打开验收</button></li>)}</ul>
   <nav><button disabled={loading||busy||offset===0} onClick={()=>{setLoading(true);setOffset(v=>v-12);}}>上一页</button><span>第 {offset/12+1} 页</span><button disabled={loading||busy||!items.hasMore} onClick={()=>{setLoading(true);setOffset(v=>v+12);}}>下一页</button><button disabled={loading||busy} onClick={()=>{setError('');setLoading(true);setRefresh(v=>v+1);}}>刷新列表</button></nav>
  </>}
 </section>;
}
function AcceptanceCase({summary,item,setBusy,setDirty}:{summary:Summary;item:Summary['cases'][number];setBusy:(value:boolean)=>void;setDirty:(value:boolean)=>void}){
 const [material,setMaterial]=useState<Material|null>(null),[prior,setPrior]=useState(item.judgment),[working,setWorking]=useState(item.materialAvailable),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0),[dirty,dirtyState]=useState(false);
 const draft=useRef({revision:item.judgment?.revision??0,dirty:false});
 const [conflict,setConflict]=useState(false),[needsReload,setNeedsReload]=useState(false);
 const [values,setValues]=useState<{baseline:Verdict;candidate:Verdict;rationale:string}>({baseline:prior?.baseline??blank(),candidate:prior?.candidate??blank(),rationale:prior?.rationale??''});
 function mark(value:boolean){draft.current.dirty=value;dirtyState(value);setDirty(value);}
 useEffect(()=>{if(!item.materialAvailable)return;const controller=new AbortController();setBusy(true);
  fetch(`${endpoint}?id=${summary.id}&caseId=${encodeURIComponent(item.id)}`,{signal:controller.signal,cache:'no-store'}).then(json<Material>)
   .then(value=>{if(!controller.signal.aborted){
    const revision=value.judgment?.revision??0;
    setMaterial(value);setPrior(value.judgment);setError('');setNeedsReload(false);
    if(!draft.current.dirty){draft.current.revision=revision;setValues(judgmentValues(value.judgment));setConflict(false);}
    else setConflict(draft.current.revision!==revision);
   }}).catch(e=>{if(!controller.signal.aborted){setMaterial(null);setError(e.message);}})
   .finally(()=>{if(!controller.signal.aborted){setWorking(false);setBusy(false);}});
  return()=>controller.abort();
 },[summary.id,item.id,item.materialAvailable,reload,setBusy]);
 const ready=material&&!conflict&&!needsReload&&(['baseline','candidate'] as const).every(side=>Object.values(values[side]).every(value=>typeof value==='boolean'))&&values.rationale.trim();
 async function save(revoked=false){setWorking(true);setBusy(true);setError('');setNotice('');try{
  const saved=await json<{revision:number}>(await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bundleId:summary.id,artifactHash:material?.artifactHash??summary.artifactHash,expectedRevision:draft.current.revision,
   judgment:{caseId:item.id,observationHash:material?.observationHash??item.observationHash,revoked,...(revoked&&prior?{baseline:prior.baseline,candidate:prior.candidate,rationale:prior.rationale}:values)}})}));
  draft.current.revision=saved.revision;mark(false);setConflict(false);setNeedsReload(true);setNotice(revoked?'判决已撤销':'本题判决已保存');setMaterial(null);
  try{
   const latest=await json<Summary>(await fetch(`${endpoint}?id=${summary.id}`,{cache:'no-store'})),judgment=latest.cases.find(row=>row.id===item.id)?.judgment??null;
   setPrior(judgment);draft.current.revision=judgment?.revision??0;setValues(judgmentValues(judgment));setNeedsReload(false);
  }catch{setError('判决已保存，但最新状态暂时无法读取；请重新核对后继续。');}
 }catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setWorking(false);setBusy(false);}}
 return <div className="skill-review-case">
  {working&&<p role="status">正在核对当前来源，请稍候…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}{dirty&&' 草稿仍保留。'}</p>}
  {conflict&&<aside role="alert"><p>本题已有更新的判决 r{prior?.revision??0}。草稿仍保留，请核对后选择如何继续。</p>
   <details><summary>查看最新判决</summary><p>{prior?.rationale??'当前没有已保存判决。'}</p>{prior&&(['baseline','candidate'] as const).map(side=><p key={side}>{side==='baseline'?'原流程':'候选 Skill'}：{(Object.entries(metrics) as Array<[keyof Verdict,string]>).map(([key,label])=>`${label}${prior[side][key]?'通过':'不通过'}`).join('；')}</p>)}</details>
   <button disabled={working} onClick={()=>{draft.current.revision=prior?.revision??0;setConflict(false);mark(true);}}>已核对最新判决，继续使用草稿</button>
   <button disabled={working} onClick={()=>{setValues(judgmentValues(prior));draft.current.revision=prior?.revision??0;setConflict(false);mark(false);}}>采用最新判决</button>
  </aside>}
  {!item.materialAvailable&&<p>本题尚无可审核的完整材料，不能提交通过判决。</p>}
  {material&&<><h4>{material.question}</h4><div className="skill-review-arms">{(['baseline','candidate'] as const).map(side=><fieldset key={side} disabled={working}><legend>{side==='baseline'?'原流程':'候选 Skill'}</legend>
   <div className="skill-review-answer">{material[side]}</div>
   {!material.canPass[side]&&<p>本侧执行未完成，只能判为不通过。</p>}
   {(Object.entries(metrics) as Array<[keyof Verdict,string]>).map(([key,label])=><label key={key}>{label}<select aria-label={`${side==='baseline'?'原流程':'候选 Skill'}：${label}`} value={values[side][key]===null?'':String(values[side][key])} onChange={e=>{setValues(v=>({...v,[side]:{...v[side],[key]:e.target.value===''?null:e.target.value==='true'}}));mark(true);}}><option value="">待判断</option><option value="true" disabled={!material.canPass[side]}>通过</option><option value="false">不通过</option></select></label>)}</fieldset>)}</div><SkillReviewEvidence receipts={material.receipts}/></>}
  {(material||dirty)&&<label>判决依据<textarea aria-label="判决依据" disabled={working} maxLength={4000} value={values.rationale} onChange={e=>{setValues(v=>({...v,rationale:e.target.value}));mark(true);}}/></label>}
  <footer><span>{dirty?'有未保存的修改':prior?`当前判决 r${prior.revision}${prior.revoked?'（已撤销）':''}`:'尚未保存判决'}</span>
   {item.materialAvailable&&<button disabled={working} onClick={()=>{setWorking(true);setReload(v=>v+1);}}>重新核对并保留草稿</button>}
   {dirty&&<button disabled={working} onClick={()=>{setValues(judgmentValues(prior));draft.current.revision=prior?.revision??0;setConflict(false);mark(false);}}>放弃修改</button>}
   {prior&&!prior.revoked&&<button disabled={working||dirty||needsReload||conflict} onClick={()=>void save(true)}>撤销本题判决</button>}
   <button disabled={working||!ready} onClick={()=>void save()}>保存本题判决</button>
  </footer>
 </div>;
}
