"use client";

import {useEffect,useId,useRef,useState} from "react";
import {WorkspaceDialog} from './workspace-dialog';
import {AttachmentUploadProgress} from './attachment-upload-progress';

type Asset={assetId:string;title:string;scope:string};
type LibraryItem={assetId?:string;title:string;scope:string};

export function AgentAttachments({selected,onChange}:{selected:string[];onChange:(ids:string[])=>void}){
  const dialogId=useId();
  const requestId=useRef(0);
  const lastRequest=useRef({offset:0,query:""});
  const [known,setKnown]=useState<Record<string,Asset>>({});
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState("");
  const [open,setOpen]=useState(false);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [offset,setOffset]=useState(0),[more,setMore]=useState(false),[query,setQuery]=useState('');
  const [collection,setCollection]=useState<"company"|"product"|"industry">("company");
  const [entityKey,setEntityKey]=useState("");
  const [reading,setReading]=useState(false),[uploading,setUploading]=useState(false);
  const uploadLock=useRef(false),alive=useRef(true),readRequest=useRef<AbortController|undefined>(undefined);
  const [uploadVersion,setUploadVersion]=useState(0);
  const [notice,setNotice]=useState("");
  const [uploadError,setUploadError]=useState(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;readRequest.current?.abort();};},[]);
  async function refresh(nextOffset=0,search=query){
    lastRequest.current={offset:nextOffset,query:search};
    const request=++requestId.current;
    readRequest.current?.abort();const controller=new AbortController();readRequest.current=controller;
    const timeout=setTimeout(()=>controller.abort(),10000);
    setReading(true);setError("");setLoaded(false);setMore(false);
    try{
      const pages=await Promise.all(["private","shared"].map(async scope=>{
        const response=await fetch(`/api/knowledge/library?scope=${scope}&offset=${nextOffset}&q=${encodeURIComponent(search)}`,{cache:"no-store",signal:controller.signal});
        const body=await response.json() as {items?:LibraryItem[];error?:string;hasMore?:boolean};
        if(!response.ok||!Array.isArray(body.items)||typeof body.hasMore!=="boolean"||!body.items.every(item=>item&&typeof item.title==="string"&&typeof item.scope==="string"))throw new Error("资料读取失败");
        return {items:body.items,hasMore:body.hasMore};
      }));
      if(!alive.current||request!==requestId.current)return;
      const items=[...new Map(pages.flatMap(page=>page.items).filter((item):item is Asset=>Boolean(item.assetId)).map(item=>[item.assetId,item])).values()];
      setAssets(items);setLoaded(true);
      setKnown(previous=>({...previous,...Object.fromEntries(items.map(item=>[item.assetId,item]))}));
      setOffset(nextOffset);setMore(pages.some(page=>page.hasMore));
    }catch{if(alive.current&&request===requestId.current)setError("资料读取失败，请重试。");}
    finally{clearTimeout(timeout);if(alive.current&&request===requestId.current)setReading(false);}
  }
  async function upload(file:File){
    if(uploadLock.current)return;
    if(collection==="product"&&!entityKey.trim()){setUploadError(true);setNotice("产品资料需要填写型号或 SKU");return;}
    uploadLock.current=true;setUploading(true);setNotice("");setUploadError(false);
    try{
      const form=new FormData();form.set("file",file);form.set("title",file.name);form.set("collection",collection);
      form.set("visibility","private");if(collection==="product")form.set("entityKey",entityKey.trim());
      const response=await fetch("/api/knowledge/uploads",{method:"POST",body:form});
      const body=await response.json().catch(()=>null) as {id?:string;reused?:boolean;error?:string}|null;
      if(!alive.current)return;
      if(response.ok&&typeof body?.id==="string"&&/^[a-f0-9-]{36}$/i.test(body.id)){
        setNotice(body.reused?"相同资料已有上传作业，沿用原处理进度。请核对下方状态，处理完成后刷新上方列表再选择。":"私有原件已保存。请核对下方处理进度，处理完成后刷新上方列表并选中资料，再发送任务。");setUploadVersion(value=>value+1);
      }else if(response.status>=400&&response.status<500){setUploadError(true);setNotice("上传未确认。请检查文件和资料类别，并刷新上传进度核对；系统不会自动重传。");setUploadVersion(value=>value+1);}
      else throw Error("acknowledgement-unknown");
    }catch{if(alive.current){setUploadError(true);setNotice("未收到上传确认，原件可能已保存。请先刷新上传进度核对；系统不会自动重传。");setUploadVersion(value=>value+1);}}
    finally{uploadLock.current=false;if(alive.current)setUploading(false);}
  }
  return <div className="ai-attachment-control">
    <button type="button" aria-expanded={open} aria-haspopup="dialog" aria-controls={open?dialogId:undefined} onClick={()=>{setOpen(!open);if(!open)void refresh();}}>资料 {selected.length?`(${selected.length})`:"＋"}</button>
    {open&&<WorkspaceDialog id={dialogId} title="本次任务资料" onClose={()=>setOpen(false)}>
      <div><button type="button" disabled={reading} onClick={()=>void refresh()}>刷新已处理资料</button></div>
      <p>仅选择已有原件；未完成提取的文件不会进入任务。</p>
      <div><input aria-label="搜索资料" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索标题或内容"/><button disabled={reading} onClick={()=>void refresh(0)}>搜索</button></div>
      {selected.length>0&&<section aria-label="已选资料" className="ai-attachment-selected"><h3>已选资料（{selected.length}）</h3>{selected.map((id,index)=><div key={id}><span>{known[id]?.title??`已选资料 ${index+1}（名称待加载）`}</span><button type="button" aria-label={`移除 ${known[id]?.title??`已选资料 ${index+1}`}`} onClick={()=>onChange(selected.filter(value=>value!==id))}>移除</button></div>)}</section>}
      {!loaded&&!error&&<p role="status">正在读取资料…</p>}
      {error&&<div role="alert">{error}<button type="button" disabled={reading} onClick={()=>void refresh(lastRequest.current.offset,lastRequest.current.query)}>重试读取资料</button></div>}
      <div className="ai-attachment-list">{loaded&&(assets.length?assets.map(asset=><label key={asset.assetId}><input type="checkbox" checked={selected.includes(asset.assetId)} onChange={event=>onChange(event.target.checked?[...selected,asset.assetId]:selected.filter(id=>id!==asset.assetId))}/><span>{asset.title} · {asset.scope==="private"?"私有":"共享"}</span></label>):<small>暂无匹配的已注册原件。</small>)}</div>
      <nav><button disabled={reading||!offset} onClick={()=>void refresh(Math.max(0,offset-12))}>上一页资料</button><span>第 {offset/12+1} 页 · 已选 {selected.length}</span><button disabled={reading||Boolean(error)||!more} onClick={()=>void refresh(offset+12)}>下一页资料</button></nav>
      <div className="ai-attachment-upload"><select aria-label="资料类别" disabled={uploading} value={collection} onChange={event=>setCollection(event.target.value as typeof collection)}><option value="company">公司</option><option value="product">产品</option><option value="industry">行业</option></select>
        {collection==="product"&&<input aria-label="型号或 SKU" disabled={uploading} value={entityKey} onChange={event=>setEntityKey(event.target.value)} placeholder="型号或 SKU"/>}
        <label>上传私有原件<input type="file" accept=".pdf,.pptx,.xlsx" disabled={uploading} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value="";}}/></label>
      </div>
      {uploading&&<p role="status">正在上传原件。关闭窗口不会取消本次提交，请勿重复上传。</p>}
      {notice&&<p role={uploadError?"alert":"status"}>{notice}</p>}
      <AttachmentUploadProgress key={uploadVersion}/>
    </WorkspaceDialog>}
  </div>;
}
