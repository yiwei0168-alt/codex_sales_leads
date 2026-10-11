"use client";
import {useEffect,useState} from 'react';
import {WorkspaceDialog} from './workspace-dialog';
import type {VisualCandidate} from '@/lib/knowledge/visual-review-candidates';
type Decision='evidence'|'decoration'|'unresolved';
type Item={block:{id:string;unitType:string;unitIndex:number;blockType:string;section?:string;shapePath?:number[];shapeIdPath?:number[];text?:string};judgment:{revision:number;decision:Decision;evidence_text:string;note:string}|null;candidate?:VisualCandidate|null};
type Review={jobId:string;title:string;artifactSha256:string;sourceSha256:string;decisionSha256:string;visualState?:string;total:number;resolved:number;offset:number;blocks:Item[]};

export function KnowledgeExtractionReview({jobId,onClose,onComplete}:{jobId:string;onClose:()=>void;onComplete?:()=>void}){
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
  async function complete(){
    if(!data)return;setBusy(true);setError('');
    try{const response=await fetch('/api/knowledge/uploads/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'complete',jobId,artifactSha256:data.artifactSha256,decisionSha256:data.decisionSha256})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'审核完成提交失败');(onComplete??onClose)();
    }catch(reason){setError(reason instanceof Error?reason.message:'审核完成提交失败');}finally{setBusy(false);}
  }
  async function retryVisuals(){
    if(!data)return;setBusy(true);setError('');
    try{const response=await fetch('/api/knowledge/uploads/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'retry-visuals',jobId,artifactSha256:data.artifactSha256})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'重试未提交');setMessage('已排队准备本地候选，可稍后刷新查看。');setRefresh(value=>value+1);
    }catch(reason){setError(reason instanceof Error?reason.message:'重试未提交');}finally{setBusy(false);}
  }
  return <WorkspaceDialog title="审核抽取内容" drawer busy={busy} onClose={()=>navigate(onClose)}>
    <div className="extraction-review">
      {loading&&<p role="status">正在核对原件版本…</p>}
      {error&&<p role="alert">{error} <button disabled={busy} onClick={()=>navigate(()=>{setDirty(false);setError('');setLoading(true);setRefresh(value=>value+1);})}>重新加载</button></p>}
      {data&&<><h3>{data.title}</h3><p>已核对 {data.resolved} / {data.total} 个对象</p>
        {data.visualState&&data.visualState!=='ready'&&data.visualState!=='unsupported'&&<p className="subtle">{({pending:'本地候选等待处理',running:'正在生成本地候选',retrying:'本地候选处理失败，稍后自动重试',failed:'本地候选连续处理失败，已暂停'} as Record<string,string>)[data.visualState]}
          {data.visualState==='failed'&&<button disabled={busy} onClick={()=>void retryVisuals()}>重试本地候选</button>}
          <button disabled={busy||dirty} onClick={()=>{setLoading(true);setRefresh(value=>value+1);}}>刷新候选</button></p>}
        <a href={`/api/knowledge/uploads/review?format=original&jobId=${jobId}&artifactSha256=${data.artifactSha256}`}>下载本次原件进行对照</a>
        <p className="subtle">请结合原件核对。候选文字和结构未经审核；无法判断时保留“未解决”。</p>
        {item&&<fieldset disabled={busy||loading}><legend>对象 {offset+index+1} / {data.total}</legend>
          <p>{({slide:'幻灯片',page:'页',sheet:'工作表'} as Record<string,string>)[item.block.unitType]??'单元'} {item.block.unitIndex}{item.block.section?` · ${item.block.section}`:''}</p>
          {item.block.shapePath&&<p>对象顺序：{item.block.shapePath.join(' → ')}；原生 ID：{item.block.shapeIdPath?.join(' → ')}</p>}
          {item.block.text&&<pre>{item.block.text}</pre>}
          {item.candidate?.imageFile&&<figure>
            {/* Authenticated local PNG; do not proxy private images through the image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`第 ${item.block.unitIndex} 页待审核对象原图裁剪`} src={`/api/knowledge/uploads/review?format=image&jobId=${jobId}&artifactSha256=${data.artifactSha256}&blockId=${encodeURIComponent(item.block.id)}`}/>
            <figcaption>{item.candidate.coordinateSpace==='pdf-page-render'?'原始 PDF 页面本地渲染，包含批注；文字与图表含义仍需审核。':`原始图片裁剪，旋转角度 ${item.candidate.rotation??0}°；未还原整页布局及遮挡，请结合原件核对。`}</figcaption>
          </figure>}
          {item.candidate?.ocrLines&&<details><summary>OCR 候选文字（{item.candidate.ocrLines.length} 行，未经审核）</summary><pre>{item.candidate.ocrLines.map(line=>`${line.text}（置信度 ${line.confidence.toFixed(2)}）`).join('\n')||'未识别到文字；不能据此认定为装饰。'}</pre></details>}
          {item.candidate?.diagram&&<details><summary>SmartArt 原生数据（未经审核）</summary><pre>{JSON.stringify(item.candidate.diagram,null,2)}</pre></details>}
          {item.candidate?.connector&&<details><summary>连接线原生数据（未经审核）</summary><pre>{JSON.stringify(item.candidate.connector,null,2)}</pre></details>}
          {item.candidate?.sheetObjects&&<section aria-label="工作表视觉对象">
            <p>工作表：{item.candidate.sheetName}。以下为原件中的对象与缓存数据，未计算公式、未还原图表外观；请结合原件审核。</p>
            {item.candidate.sheetObjects.map(object=><details key={object.objectIndex}><summary>对象 {object.objectIndex} · {object.kind}</summary><p>位置（原生零起点坐标）：{object.anchor}</p>
              {object.images?.map(image=><figure key={image.imageIndex}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={`工作表对象 ${object.objectIndex} 嵌入图片 ${image.imageIndex}`} src={`/api/knowledge/uploads/review?format=image&jobId=${jobId}&artifactSha256=${data.artifactSha256}&blockId=${encodeURIComponent(item.block.id)}&objectIndex=${object.objectIndex}&imageIndex=${image.imageIndex}`}/>
                <figcaption>嵌入原图，未还原工作表中的裁剪、旋转或遮挡。</figcaption>
                {image.ocrLines&&<details><summary>图片 OCR 候选（{image.ocrLines.length} 行，未经审核）</summary><pre>{image.ocrLines.map(line=>`${line.text}（置信度 ${line.confidence.toFixed(2)}）`).join('\n')||'未识别到文字；不能据此认定为装饰。'}</pre></details>}
              </figure>)}
              <pre>{object.text}</pre></details>)}
            {item.candidate.sheetObjects.length===0&&<p>该视觉对象尚无法解析，请下载原件核对。</p>}
          </section>}
          {!item.candidate&&<p className="subtle">该对象尚无本地候选预览，请下载原件核对。</p>}
          {item.candidate&&!item.candidate.imageFile&&!item.candidate.diagram&&!item.candidate.connector&&<p className="subtle">本地工具未生成此对象的可用预览，请下载原件核对。</p>}
          <label>核对结论<select value={shownDecision} onChange={event=>edit({decision:event.target.value as Decision})}><option value="unresolved">未解决，需要继续核对</option><option value="evidence">包含资料内容，记录准确文字</option><option value="decoration">仅装饰，无资料内容</option></select></label>
          {shownDecision==='evidence'&&<label>对照原件确认的内容<textarea rows={7} maxLength={20000} value={shownEvidence} onChange={event=>edit({evidence:event.target.value})}/></label>}
          <label>核对依据 / 备注<textarea rows={3} maxLength={2000} value={shownNote} onChange={event=>edit({note:event.target.value})}/></label>
          <button type="button" className="primary-button" disabled={!shownNote.trim()||(shownDecision==='evidence'&&!shownEvidence.trim())} onClick={()=>void save()}>{busy?'正在保存…':'保存本条审核'}</button>
        </fieldset>}
        <nav aria-label="抽取对象翻页"><button disabled={busy||loading||(offset===0&&index===0)} onClick={()=>navigate(()=>index>0?select(index-1):page(Math.max(0,offset-20),true))}>上一对象</button>
          <button disabled={busy||loading||offset+index+1>=data.total} onClick={()=>navigate(()=>index+1<data.blocks.length?select(index+1):page(offset+20))}>下一对象</button></nav>
        <p className="subtle">全部对象核对完成后才能提交。私有资料随后建立索引；共享资料仍需管理员登记。</p>
        <button type="button" disabled={busy||loading||dirty||data.total===0||data.resolved!==data.total} onClick={()=>void complete()}>完成审核并提交后续处理</button></>}
      {message&&<p role="status">{message}</p>}
      {discard&&<section className="extraction-review-discard" role="alert"><p>有未保存的修改，是否放弃？</p><button onClick={()=>setDiscard(null)}>继续编辑</button><button onClick={()=>{const action=discard;setDiscard(null);setDirty(false);action();}}>放弃修改</button></section>}
    </div>
  </WorkspaceDialog>;
}
