"use client";

import {useState} from "react";

type Asset={assetId:string;title:string;scope:string};
type LibraryItem={assetId?:string;title:string;scope:string};

export function AgentAttachments({selected,onChange}:{selected:string[];onChange:(ids:string[])=>void}){
  const [open,setOpen]=useState(false);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [collection,setCollection]=useState<"company"|"product"|"industry">("company");
  const [entityKey,setEntityKey]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  async function refresh(){
    setBusy(true);setNotice("");
    try{
      const pages=await Promise.all(["private","shared"].map(async scope=>{
        const response=await fetch(`/api/knowledge/library?scope=${scope}&offset=0`,{cache:"no-store"});
        const body=await response.json() as {items?:LibraryItem[];error?:string};
        if(!response.ok)throw new Error(body.error??"资料读取失败");
        return body.items??[];
      }));
      setAssets([...new Map(pages.flat().filter((item):item is Asset=>Boolean(item.assetId)).map(item=>[item.assetId,item])).values()]);
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
    {open&&<div className="ai-attachment-panel">
      <div><strong>本次任务资料</strong><button type="button" disabled={busy} onClick={()=>void refresh()}>刷新已处理资料</button></div>
      <p>仅选择已有原件；未完成提取的文件不会进入任务。</p>
      <div className="ai-attachment-list">{assets.length?assets.map(asset=><label key={asset.assetId}><input type="checkbox" checked={selected.includes(asset.assetId)} onChange={event=>onChange(event.target.checked?[...selected,asset.assetId]:selected.filter(id=>id!==asset.assetId))}/><span>{asset.title} · {asset.scope==="private"?"私有":"共享"}</span></label>):<small>暂无可选择的已注册原件。</small>}</div>
      <div className="ai-attachment-upload"><select aria-label="资料类别" value={collection} onChange={event=>setCollection(event.target.value as typeof collection)}><option value="company">公司</option><option value="product">产品</option><option value="industry">行业</option></select>
        {collection==="product"&&<input aria-label="型号或 SKU" value={entityKey} onChange={event=>setEntityKey(event.target.value)} placeholder="型号或 SKU"/>}
        <label>上传私有原件<input type="file" accept=".pdf,.pptx,.xlsx" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value="";}}/></label>
      </div>
      {notice&&<p role="status">{notice}</p>}
    </div>}
  </div>;
}
