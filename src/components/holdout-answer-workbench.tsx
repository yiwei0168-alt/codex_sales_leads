"use client";

import {useCallback,useEffect,useState} from "react";
import type {AnswerCandidate,AnswerPath,AnswerVerdict} from "@/lib/knowledge/evaluation/answer-comparison";
import type {GoldSourceCoordinate} from "@/lib/knowledge/review-types";

type ReviewPath={path:AnswerPath;candidate:AnswerCandidate;candidateSha256:string;verdict:AnswerVerdict|null};
type ReviewCase={caseId:string;query:string;group:string;tags:string[];expectedOutcome:string;
  goldAnswer:string;goldSources:GoldSourceCoordinate[];paths:ReviewPath[]};
type ReviewResponse={total:number;offset:number;limit:number;reviewed:number;candidateCount:number;
  profileKey:string;items:ReviewCase[];sourceLinks:Record<string,string>};
type Decision={answerCorrect:boolean|null;preciseCitationCorrect:boolean|null;note:string};

async function readResponse<T>(response:Response):Promise<T>{
  const body=await response.json() as T&{error?:string};
  if(!response.ok)throw new Error(body.error??"请求失败");
  return body;
}
function coordinateLabel(source:GoldSourceCoordinate){
  const position=`第 ${source.unitIndex} 页/张/表${source.row?` · 第 ${source.row} 行`:""}`;
  return `${position}${source.version?` · ${source.version}`:""}${source.blockId?` · ${source.blockId}`:""}`;
}
function SourceList({sources,links}:{sources:GoldSourceCoordinate[];links:Record<string,string>}){
  if(!sources.length)return <p className="holdout-no-source">没有登记来源坐标</p>;
  return <ol className="holdout-sources">{sources.map((source,index)=><li key={`${source.assetSha256}:${source.unitIndex}:${index}`}>
    <div><span>{coordinateLabel(source)}</span>{links[source.assetSha256]&&<a href={links[source.assetSha256]} target="_blank" rel="noreferrer">打开原件</a>}</div>
    <code title={source.assetSha256}>{source.assetSha256.slice(0,16)}…</code>
    {source.excerpt&&<blockquote>{source.excerpt}</blockquote>}
  </li>)}</ol>;
}
function pathWarnings(item:ReviewCase,path:ReviewPath){
  const warnings:string[]=[];
  if(item.expectedOutcome==="route"&&!path.candidate.citations.length)warnings.push("资料题缺少来源坐标");
  if(item.expectedOutcome!=="route"&&path.candidate.citations.length)warnings.push("此类题出现额外来源坐标");
  const markers=path.candidate.answer.match(/\[KB:[^\]]*\]/g)??[];
  if(markers.some(marker=>!/\[KB:[0-9a-f]{64}:\d+(?::\d+)?\]/.test(marker)))warnings.push("回答中含无法解析的 KB 引用标记");
  return warnings;
}
function VerdictForm({item,path,links,onSaved}:{item:ReviewCase;path:ReviewPath;
  links:Record<string,string>;onSaved:()=>Promise<void>}){
  const [decision,setDecision]=useState<Decision>({answerCorrect:path.verdict?.answerCorrect??null,
    preciseCitationCorrect:path.verdict?.preciseCitationCorrect??null,note:path.verdict?.note??""});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const warnings=pathWarnings(item,path);
  async function save(){
    if(decision.answerCorrect===null||decision.preciseCitationCorrect===null)return;
    setBusy(true);setMessage("");
    try{
      await readResponse(await fetch("/api/knowledge/holdout-answer-reviews",{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({caseId:item.caseId,path:path.path,candidateSha256:path.candidateSha256,
          answerCorrect:decision.answerCorrect,preciseCitationCorrect:decision.preciseCitationCorrect,note:decision.note}),
      }));
      setMessage("已保存审核结论");
      await onSaved();
    }catch(error){setMessage(error instanceof Error?error.message:"保存失败");}
    finally{setBusy(false);}
  }
  return <article className="holdout-candidate">
    <header><div><span>{path.path==="v3"?"现行 v3":"无向量主路"}</span><small>{path.verdict?`已审核 · ${new Date(path.verdict.reviewedAt).toLocaleString("zh-CN")}`:"待审核"}</small></div><code title={path.candidateSha256}>候选 {path.candidateSha256.slice(0,12)}…</code></header>
    <div className="holdout-answer">{path.candidate.answer}</div>
    {warnings.length>0&&<ul className="holdout-warnings">{warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>}
    <div className="holdout-source-heading">候选引用 · {path.candidate.citations.length}</div>
    <SourceList sources={path.candidate.citations} links={links}/>
    <div className="holdout-verdict">
      <fieldset><legend>答案是否正确？</legend><div><label><input type="radio" name={`${item.caseId}-${path.path}-answer`} checked={decision.answerCorrect===true} onChange={()=>setDecision(current=>({...current,answerCorrect:true}))}/>正确</label><label><input type="radio" name={`${item.caseId}-${path.path}-answer`} checked={decision.answerCorrect===false} onChange={()=>setDecision(current=>({...current,answerCorrect:false}))}/>不正确</label></div></fieldset>
      <fieldset><legend>精确引用是否正确？</legend><div><label><input type="radio" name={`${item.caseId}-${path.path}-source`} checked={decision.preciseCitationCorrect===true} onChange={()=>setDecision(current=>({...current,preciseCitationCorrect:true}))}/>正确</label><label><input type="radio" name={`${item.caseId}-${path.path}-source`} checked={decision.preciseCitationCorrect===false} onChange={()=>setDecision(current=>({...current,preciseCitationCorrect:false}))}/>不正确</label></div></fieldset>
      <label className="holdout-note">审核备注<textarea value={decision.note} onChange={event=>setDecision(current=>({...current,note:event.target.value}))} placeholder="记录答案或引用的具体问题；无答案题说明判断依据"/></label>
      <button className="primary-button" disabled={busy||decision.answerCorrect===null||decision.preciseCitationCorrect===null} onClick={()=>void save()}>{path.verdict?"更新此路径结论":"保存此路径结论"}</button>
      {message&&<p role="status">{message}</p>}
    </div>
  </article>;
}

export function HoldoutAnswerWorkbench(){
  const [data,setData]=useState<ReviewResponse|null>(null);
  const [selectedId,setSelectedId]=useState("");
  const [offset,setOffset]=useState(0);
  const [pendingOnly,setPendingOnly]=useState(true);
  const [busy,setBusy]=useState(true);
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    const params=new URLSearchParams({offset:String(offset),limit:"5",pendingOnly:String(pendingOnly)});
    const next=await readResponse<ReviewResponse>(await fetch(`/api/knowledge/holdout-answer-reviews?${params}`,{cache:"no-store"}));
    setData(next);
    setSelectedId(current=>next.items.some(item=>item.caseId===current)?current:next.items[0]?.caseId??"");
  },[offset,pendingOnly]);
  useEffect(()=>{
    const controller=new AbortController();
    const params=new URLSearchParams({offset:String(offset),limit:"5",pendingOnly:String(pendingOnly)});
    fetch(`/api/knowledge/holdout-answer-reviews?${params}`,{cache:"no-store",signal:controller.signal})
      .then(response=>readResponse<ReviewResponse>(response))
      .then(next=>{setData(next);setSelectedId(current=>next.items.some(item=>item.caseId===current)?current:next.items[0]?.caseId??"");setBusy(false);setMessage("");})
      .catch(error=>{if(!controller.signal.aborted){setMessage(error instanceof Error?error.message:"冻结集读取失败");setBusy(false);}});
    return()=>controller.abort();
  },[offset,pendingOnly]);
  const selected=data?.items.find(item=>item.caseId===selectedId)??null;
  async function refresh(){try{await load();}catch(error){setMessage(error instanceof Error?error.message:"刷新失败");}}
  return <div className="holdout-workbench">
    <div className="holdout-toolbar"><div><strong>冻结集答案对照</strong><span>{data?.reviewed??0} / {data?.candidateCount??100} 条路径已审核 · {data?.profileKey??"已冻结配置"}</span></div><label><input type="checkbox" checked={pendingOnly} onChange={event=>{setPendingOnly(event.target.checked);setOffset(0);}}/>只看待审核</label></div>
    {message&&<p className="review-message" role="status">{message}</p>}
    <div className="holdout-layout"><aside className="holdout-queue"><div className="holdout-queue-title">题目 <span>{data?.total??0}</span></div>
      <div className="review-list" aria-busy={busy}>{data?.items.map(item=><button key={item.caseId} className={item.caseId===selectedId?"active":""} onClick={()=>setSelectedId(item.caseId)}><strong>{item.caseId}</strong><b>{item.paths.filter(path=>path.verdict).length}/2 已审</b><small>{item.query}</small></button>)}
        {!busy&&data?.items.length===0&&<p>{pendingOnly?"本页没有待审核题目。":"没有冻结集题目。"}</p>}</div>
      <div className="review-pagination"><button disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-5))}>上一页</button><span>{data?.total?`${offset+1}–${Math.min(offset+5,data.total)} / ${data.total}`:"0 / 0"}</span><button disabled={busy||offset+5>=(data?.total??0)} onClick={()=>setOffset(offset+5)}>下一页</button></div>
    </aside>
    <div className="holdout-case">{selected?<><header className="holdout-case-title"><span>{selected.caseId} · {selected.group} · {selected.expectedOutcome}</span><h3>{selected.query}</h3>{selected.tags.length>0&&<small>{selected.tags.join(" · ")}</small>}</header>
      <section className="holdout-gold"><h4>已审核 Gold</h4><p>{selected.goldAnswer}</p><div className="holdout-source-heading">Gold 来源 · {selected.goldSources.length}</div><SourceList sources={selected.goldSources} links={data?.sourceLinks??{}}/></section>
      <div className="holdout-comparison">{selected.paths.map(path=><VerdictForm key={`${selected.caseId}:${path.path}:${path.candidateSha256}`} item={selected} path={path} links={data?.sourceLinks??{}} onSaved={refresh}/>)}</div>
    </>:<div className="review-empty">{busy?"正在读取冻结集…":"选择左侧题目进行审核。"}</div>}</div></div>
  </div>;
}
