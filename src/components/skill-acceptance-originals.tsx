'use client';
import {useEffect,useState} from 'react';
import type {previewSkillAcceptanceOriginals} from '@/lib/assistant/main/skill-acceptance-originals';
type Preview=Awaited<ReturnType<typeof previewSkillAcceptanceOriginals>>;
const endpoint='/api/assistant/skills/acceptance-originals';
async function value(response:Response):Promise<Preview>{const body=await response.json();if(!response.ok)throw new Error(body.error||'原件副本暂不可用');return body;}
export function SkillAcceptanceOriginals({bundleId,disabled,setBusy}:{bundleId:string;disabled:boolean;setBusy:(busy:boolean)=>void}){
 const [preview,setPreview]=useState<Preview|null>(null),[working,setWorking]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{const controller=new AbortController();
  fetch(`${endpoint}?bundleId=${encodeURIComponent(bundleId)}`,{cache:'no-store',signal:controller.signal}).then(value)
   .then(data=>{if(!controller.signal.aborted){setPreview(data);setError('');}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'原件副本暂不可用');});
  return()=>controller.abort();
 },[bundleId,reload]);
 async function capture(){
  if(!preview||working)return;setWorking(true);setBusy(true);setError('');setNotice('');
  try{
   const saved=await value(await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bundleId,artifactHash:preview.artifactHash,sourceManifestHash:preview.sourceManifestHash})}));
   setPreview(saved);setNotice('本组文件原件副本已保存。');
  }catch{setError('保存结果未确认，请重新核对原件后再操作。');}
  finally{setWorking(false);setBusy(false);}
 }
 return <fieldset disabled={disabled||working}><legend>文件原件副本</legend>
  <p>保存本组任务附件和已读取资料的原件副本，便于后续复核。资料撤回与访问权限仍按当前设置；此操作不会通过审核或启用 Skill。</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!preview&&!error&&<p role="status">正在核对原件…</p>}
  {preview&&<>
   <p>{preview.assetCount?`共 ${preview.assetCount} 个原件，${(preview.totalBytes/1024/1024).toFixed(1)} MiB；已保存 ${preview.capturedCount} 个。`:'本组任务没有可保存的文件原件。'}</p>
   <ul>{preview.assets.slice(0,12).map(asset=><li key={asset.id}>{asset.title} · {asset.captured?'已保存':'待保存'}</li>)}</ul>
   {preview.assetCount>12&&<p>还有 {preview.assetCount-12} 个原件；保存将包含全部 {preview.assetCount} 个。</p>}
   {preview.unsupportedCount>0&&<p>有 {preview.unsupportedCount} 个原件超过 50 MiB，暂无法保存本组副本。</p>}
   <button disabled={!preview.pendingCount||preview.unsupportedCount>0} onClick={()=>void capture()}>{working?'正在保存…':'保存原件副本'}</button>
  </>}
  <button onClick={()=>{setNotice('');setReload(v=>v+1);}}>重新核对原件</button>
 </fieldset>;
}
