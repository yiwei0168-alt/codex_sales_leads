"use client";

import {useState} from "react";
import {WorkspaceDialog} from './workspace-dialog';

type Asset={assetId:string;title:string;scope:string};
type LibraryItem={assetId?:string;title:string;scope:string};

export function AgentAttachments({selected,onChange}:{selected:string[];onChange:(ids:string[])=>void}){
  const [open,setOpen]=useState(false);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [offset,setOffset]=useState(0),[more,setMore]=useState(false),[query,setQuery]=useState('');
  const [collection,setCollection]=useState<"company"|"product"|"industry">("company");
  const [entityKey,setEntityKey]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  async function refresh(nextOffset=0){
    setBusy(true);setNotice("");
    try{
      const pages=await Promise.all(["private","shared"].map(async scope=>{
        const response=await fetch(`/api/knowledge/library?scope=${scope}&offset=${nextOffset}&q=${encodeURIComponent(query)}`,{cache:"no-store"});
        const body=await response.json() as {items?:LibraryItem[];error?:string;hasMore?:boolean};
        if(!response.ok)throw new Error(body.error??"资料读取失败");
        return {items:body.items??[],hasMore:body.hasMore??false};
      }));
      setAssets([...new Map(pages.flatMap(page=>page.items).filter((item):item is Asset=>Boolean(item.assetId)).map(item=>[item.assetId,item])).values()]);
      setOffset(nextOffset);setMore(pages.some(page=>page.hasMore));
    }catch(error){setNotice(error instanceof Error?error.message:"资料读取失败");}
    finally{setBusy(false);}
  }
  async function upload(file:File){
    if(collection==="product"&&!entityKey.trim()){setNotice("产品资料需要填写型号或 SKU");return;}
    setBusy(true);setNotice("");
    try{
      const form=new FormData();form.set("file",file);form.set("title",file.name);form.set("collection",collection);
      form.set("visibility","private");if(collection==="product")form.set("entityKey",entityKey.trim());
      const response=await fetch("/api/knowledge/uploads",{method:"POST",body:form});
      const body=await response.json() as {error?:string};
      if(!response.ok)throw new Error(body.error??"上传失败");
      setNotice("私有资料已保存，正在等待本地提取。处理完成后刷新列表并选中资料，再发送任务。");
    }catch(error){setNotice(error instanceof Error?error.message:"上传失败");}
    finally{setBusy(false);}
  }
  return <div className="ai-attachment-control">
    <button type="button" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void refresh();}}>资料 {selected.length?`(${selected.length})`:"＋"}</button>
    {open&&<WorkspaceDialog title="本次任务资料" onClose={()=>setOpen(false)}>
      <div><strong>本次任务资料</strong><button type="button" disabled={busy} onClick={()=>void refresh()}>刷新已处理资料</button></div>
      <p>仅选择已有原件；未完成提取的文件不会进入任务。</p>
      <div><input aria-label="搜索资料" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索标题或内容"/><button disabled={busy} onClick={()=>void refresh(0)}>搜索</button></div>
      <div className="ai-attachment-list">{assets.length?assets.map(asset=><label key={asset.assetId}><input type="checkbox" checked={selected.includes(asset.assetId)} onChange={event=>onChange(event.target.checked?[...selected,asset.assetId]:selected.filter(id=>id!==asset.assetId))}/><span>{asset.title} · {asset.scope==="private"?"私有":"共享"}</span></label>):<small>暂无可选择的已注册原件。</small>}</div>
      <nav><button disabled={busy||!offset} onClick={()=>void refresh(Math.max(0,offset-12))}>上一页资料</button><span>第 {offset/12+1} 页 · 已选 {selected.length}</span><button disabled={busy||!more} onClick={()=>void refresh(offset+12)}>下一页资料</button></nav>
      <div className="ai-attachment-upload"><select aria-label="资料类别" value={collection} onChange={event=>setCollection(event.target.value as typeof collection)}><option value="company">公司</option><option value="product">产品</option><option value="industry">行业</option></select>
        {collection==="product"&&<input aria-label="型号或 SKU" value={entityKey} onChange={event=>setEntityKey(event.target.value)} placeholder="型号或 SKU"/>}
        <label>上传私有原件<input type="file" accept=".pdf,.pptx,.xlsx" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value="";}}/></label>
      </div>
      {notice&&<p role="status">{notice}</p>}
    </WorkspaceDialog>}
  </div>;
}
