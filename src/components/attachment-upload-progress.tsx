"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

type Job={id:string;title:string;visibility:string;status:string;treeStatus:string};
const labels:Record<string,string>={pending:"待提取",running:"提取中",extracted:"已抽取，待登记",indexing:"建立索引中",registered:"建立索引中",searchable:"可检索",historical:"历史版本",unavailable:"已停用",failed:"处理失败","review-required":"待审核抽取内容"};

/** Read-only status: an upload receipt is not permission to attach an unprocessed file. */
export function AttachmentUploadProgress(){
 const [offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
 const [jobs,setJobs]=useState<Job[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [more,setMore]=useState(false);
 useEffect(()=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);let active=true;
  void fetch(`/api/knowledge/uploads?offset=${offset}&limit=7`,{cache:"no-store",signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error();const body:unknown=await response.json();
    if(!body||typeof body!=="object"||!("jobs" in body)||!Array.isArray(body.jobs)||!body.jobs.every((job:unknown)=>job&&typeof job==="object"&&["id","title","visibility","status","treeStatus"].every(key=>key in job&&typeof (job as Record<string,unknown>)[key]==="string")))throw Error();
    if(active){setJobs(body.jobs.slice(0,6));setMore(body.jobs.length>6);}
   }).catch(()=>{if(active)setError("上传进度读取失败，请重试核对。");})
   .finally(()=>{clearTimeout(timeout);if(active)setLoading(false);});
  return()=>{active=false;clearTimeout(timeout);controller.abort();};
 },[offset,revision]);
 function start(){setLoading(true);setError("");setJobs([]);setMore(false);}
 return <section aria-label="我的上传处理进度" className="ai-attachment-jobs">
  <h3>我的上传处理进度</h3>
  <p>上传完成不代表已经可用。只有处理完成并出现在上方列表的原件，才能选入任务。</p>
  <button type="button" disabled={loading} onClick={()=>{start();setRevision(value=>value+1);}}>刷新上传进度</button>
  {loading&&<p role="status">正在读取上传进度…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&(jobs.length?jobs.map(job=><article key={job.id}><strong>{job.title}</strong><p>{job.visibility==="private"?"私有":job.visibility==="shared"?"共享":"范围待核对"} · {labels[job.treeStatus]??"处理状态待核对"}</p></article>):<p>本页没有上传记录。</p>)}
  <nav aria-label="上传进度分页"><button type="button" disabled={loading||!offset} onClick={()=>{start();setOffset(value=>Math.max(0,value-6));}}>上一页上传</button><span>第 {offset/6+1} 页</span><button type="button" disabled={loading||Boolean(error)||!more} onClick={()=>{start();setOffset(value=>value+6);}}>下一页上传</button></nav>
  <p><Link href="/knowledge">到知识库查看详情、审核或发布资料</Link></p>
 </section>;
}
