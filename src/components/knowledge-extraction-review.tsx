"use client";
import {useEffect,useState} from 'react';
import {WorkspaceDialog} from './workspace-dialog';
type Decision='evidence'|'decoration'|'unresolved';
type Item={block:{id:string;unitType:string;unitIndex:number;blockType:string;section?:string;shapePath?:number[];shapeIdPath?:number[];text?:string};judgment:{revision:number;decision:Decision;evidence_text:string;note:string}|null};
type Review={jobId:string;title:string;artifactSha256:string;sourceSha256:string;total:number;resolved:number;offset:number;blocks:Item[]};

export function KnowledgeExtractionReview({jobId,onClose}:{jobId:string;onClose:()=>void}){
  const [offset,setOffset]=useState(0),[index,setIndex]=useState(0),[refresh,setRefresh]=useState(0);
  const [data,setData]=useState<Review|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [decision,setDecision]=useState<Decision>('unresolved'),[evidence,setEvidence]=useState(''),[note,setNote]=useState('');
  const [dirty,setDirty]=useState(false),[discard,setDiscard]=useState<null|(()=>void)>(null);
  const item=data?.blocks[index];
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/knowledge/uploads/review?jobId=${jobId}&offset=${offset}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'审核读取失败');return body as Review;})
      .then(body=>{setData(body);setLoading(false);}).catch(reason=>{if(!controller.signal.aborted){setError(reason instanceof Error?reason.message:'审核读取失败');setLoading(false);}});
    return()=>controller.abort();
  },[jobId,offset,refresh]);
  function select(next:number){
    const row=data?.blocks[next];setIndex(next);setDecision(row?.judgment?.decision??'unresolved');setEvidence(row?.judgment?.evidence_text??'');setNote(row?.judgment?.note??'');setDirty(false);setMessage('');
  }
  // A loaded page mounts an editor with its saved revision; no candidate is auto-approved.
  const saved=item?.judgment;
  const shownDecision=dirty?decision:saved?.decision??'unresolved';
  const shownEvidence=dirty?evidence:saved?.evidence_text??'';
  const shownNote=dirty?note:saved?.note??'';
  function edit(values:{decision?:Decision;evidence?:string;note?:string}){setDecision(values.decision??shownDecision);setEvidence(values.evidence??shownEvidence);setNote(values.note??shownNote);setDirty(true);setMessage('');}
  function navigate(action:()=>void){if(dirty)setDiscard(()=>action);else action();}
  function page(next:number,last=false){setLoading(true);setError('');setData(null);setIndex(last?19:0);setDirty(false);setOffset(next);}
  async function save(){
    if(!data||!item)return;setBusy(true);setError('');setMessage('');
    try{
      const response=await fetch('/api/knowledge/uploads/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId,artifactSha256:data.artifactSha256,blockId:item.block.id,expectedRevision:saved?.revision??0,decision:shownDecision,evidenceText:shownDecision==='evidence'?shownEvidence:'',note:shownNote})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'审核未保存');
      setDirty(false);setMessage(`已保存修订 ${body.revision}。`);setLoading(true);setRefresh(value=>value+1);
    }catch(reason){setError(reason instanceof Error?reason.message:'审核未保存');}finally{setBusy(false);}
  }
  return <WorkspaceDialog title="审核抽取内容" drawer busy={busy} onClose={()=>navigate(onClose)}>
    <div className="extraction-review">
      {loading&&<p role="status">正在核对原件版本…</p>}
      {error&&<p role="alert">{error} <button disabled={busy} onClick={()=>navigate(()=>{setDirty(false);setError('');setLoading(true);setRefresh(value=>value+1);})}>重新加载</button></p>}
      {data&&<><h3>{data.title}</h3><p>已核对 {data.resolved} / {data.total} 个对象</p>
        <a href={`/api/knowledge/uploads/review?format=original&jobId=${jobId}&artifactSha256=${data.artifactSha256}`}>下载本次原件进行对照</a>
        <p className="subtle">请在原件中核对对应位置。当前尚未提供对象图像预览；无法判断时保留“未解决”。</p>
        {item&&<fieldset disabled={busy||loading}><legend>对象 {offset+index+1} / {data.total}</legend>
          <p>{({slide:'幻灯片',page:'页',sheet:'工作表'} as Record<string,string>)[item.block.unitType]??'单元'} {item.block.unitIndex}{item.block.section?` · ${item.block.section}`:''}</p>
          {item.block.shapePath&&<p>对象顺序：{item.block.shapePath.join(' → ')}；原生 ID：{item.block.shapeIdPath?.join(' → ')}</p>}
          {item.block.text&&<pre>{item.block.text}</pre>}
          <label>核对结论<select value={shownDecision} onChange={event=>edit({decision:event.target.value as Decision})}><option value="unresolved">未解决，需要继续核对</option><option value="evidence">包含资料内容，记录准确文字</option><option value="decoration">仅装饰，无资料内容</option></select></label>
          {shownDecision==='evidence'&&<label>对照原件确认的内容<textarea rows={7} maxLength={20000} value={shownEvidence} onChange={event=>edit({evidence:event.target.value})}/></label>}
          <label>核对依据 / 备注<textarea rows={3} maxLength={2000} value={shownNote} onChange={event=>edit({note:event.target.value})}/></label>
          <button type="button" className="primary-button" disabled={!shownNote.trim()||(shownDecision==='evidence'&&!shownEvidence.trim())} onClick={()=>void save()}>{busy?'正在保存…':'保存本条审核'}</button>
        </fieldset>}
        <nav aria-label="抽取对象翻页"><button disabled={busy||loading||(offset===0&&index===0)} onClick={()=>navigate(()=>index>0?select(index-1):page(Math.max(0,offset-20),true))}>上一对象</button>
          <button disabled={busy||loading||offset+index+1>=data.total} onClick={()=>navigate(()=>index+1<data.blocks.length?select(index+1):page(offset+20))}>下一对象</button></nav>
        <p className="subtle">本次仅保存审核记录，尚未恢复索引或发布资料。</p></>}
      {message&&<p role="status">{message}</p>}
      {discard&&<section className="extraction-review-discard" role="alert"><p>有未保存的修改，是否放弃？</p><button onClick={()=>setDiscard(null)}>继续编辑</button><button onClick={()=>{const action=discard;setDiscard(null);setDirty(false);action();}}>放弃修改</button></section>}
    </div>
  </WorkspaceDialog>;
}
