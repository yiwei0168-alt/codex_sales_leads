"use client";
import {useEffect,useState} from "react";
import {MemorySkills} from "./memory-skills";
import styles from './memory-observations.module.css';

type View="current"|"timeline"|"conflicts"|"notices"|"skills";
type Item={id?:string;observation_id?:string;kind?:string;content?:string;recorded_at?:string;valid_from?:string|null;valid_until?:string|null;
  source_receipt?:Record<string,unknown>;invalidates_id?:string|null;is_invalidated?:boolean;earlier_id?:string;later_id?:string;earlier_content?:string;later_content?:string;created_at?:string;read_at?:string|null};
const labels:Record<View,string>={current:"当前有效",timeline:"历史时间轴",conflicts:"冲突待处理",notices:"学习通知",skills:"Skill"};

export function MemoryObservations(){
  const [view,setView]=useState<View>("current"),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  const [items,setItems]=useState<Item[]>([]),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<{id:string;cardId:string;original:string}|null>(null),[content,setContent]=useState(''),[reason,setReason]=useState('');
  const [editError,setEditError]=useState(''),[notice,setNotice]=useState('');
  const [timeMode,setTimeMode]=useState<'preserve'|'replace'>('preserve'),[validFrom,setValidFrom]=useState(''),[validUntil,setValidUntil]=useState('');
  useEffect(()=>{
    if(view==="skills")return;
    const controller=new AbortController();
    fetch(`/api/knowledge/observations?view=${view}&offset=${offset}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("读取失败");return response.json();})
      .then(data=>{if(controller.signal.aborted)return;setItems(data.items);setHasMore(data.hasMore);setError("");setLoading(false);})
      .catch(()=>{if(!controller.signal.aborted){setError("记忆观察读取失败，请重试");setLoading(false);}});
    return()=>controller.abort();
  },[view,offset,revision]);
  function changeView(next:View){setView(next);setOffset(0);setLoading(true);setItems([]);setEditing(null);setNotice('');}
  function startCorrection(id:string,original:string,cardId=id){setEditing({id,cardId,original});setContent(original);setReason('');setEditError('');setNotice('');setTimeMode('preserve');setValidFrom('');setValidUntil('');}
  async function saveCorrection(){
    if(!editing||busy)return;
    setBusy(true);setEditError('');
    try{
      const businessTime=timeMode==='replace'?{validFrom:validFrom?new Date(validFrom).toISOString():null,validUntil:validUntil?new Date(validUntil).toISOString():null}:undefined;
      if(businessTime?.validFrom&&businessTime.validUntil&&businessTime.validUntil<=businessTime.validFrom)throw new Error('结束时间必须晚于开始时间。');
      const response=await fetch('/api/knowledge/observations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'correct',id:editing.id,content,reason,businessTime})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'更正未保存，请稍后重试。');
      setEditing(null);setNotice('更正已保存，原记录保留在历史时间轴。');setRevision(value=>value+1);
    }catch(error){setEditError(error instanceof Error?error.message:'更正未保存，请稍后重试。');}finally{setBusy(false);}
  }
  async function undo(id:string){
    setBusy(true);try{
      const response=await fetch("/api/knowledge/observations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"undo",id})});
      if(!response.ok){const data=await response.json();throw new Error(data.error||"撤销失败，请刷新后重试");}
      setRevision(value=>value+1);
    }catch(error){setError(error instanceof Error?error.message:"撤销失败");}finally{setBusy(false);}
  }
  return <section className={`panel ${styles.workspace}`} aria-label="学习记忆">
    <h3>学习记忆</h3><p>带来源的内部工作记忆。业务生效时间未知的记录保留在历史时间轴；正式事实仍需核验。</p>
    <nav className="knowledge-material-nav" aria-label="学习记忆分区">{(Object.keys(labels) as View[]).map(key=><button key={key} type="button" disabled={busy||!!editing} aria-current={view===key?"page":undefined} onClick={()=>changeView(key)}>{labels[key]}</button>)}</nav>
    {view==="skills"?<MemorySkills/>:<>
    {loading&&<p>正在读取…</p>}{error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!loading&&!error&&!items.length&&<p>当前分区暂无记录。</p>}
    <div className={styles.records}>{items.map((item,index)=><article className="opportunity-card" key={item.id??item.observation_id??index}>
      {view==="conflicts"?<><strong>待核对的两条记忆</strong><p>{item.earlier_content}</p>
        <button type="button" className="secondary-button" disabled={busy||!!editing} onClick={()=>startCorrection(item.earlier_id!,item.earlier_content!,item.id!)}>更正前一条</button>
        <p>{item.later_content}</p><button type="button" className="secondary-button" disabled={busy||!!editing} onClick={()=>startCorrection(item.later_id!,item.later_content!,item.id!)}>更正后一条</button></>
        :<><strong>{item.kind??"记忆观察"}</strong><p style={{whiteSpace:"pre-wrap"}}>{item.content}</p>
          <small>{item.recorded_at??item.created_at}{item.valid_from?` · 业务生效 ${item.valid_from}`:" · 业务生效时间未知"}{item.valid_until?` · 业务结束（不含）${item.valid_until}`:''}</small>
          {item.source_receipt&&<details><summary>来源收据</summary><pre>{JSON.stringify(item.source_receipt,null,2)}</pre></details>}
          {item.is_invalidated&&<p>已更正或撤销，保留供历史追溯。</p>}
          {item.id&&!item.invalidates_id&&!item.is_invalidated&&view!=="notices"&&<div className={styles.actions}>
            {!String(item.source_receipt?.type).startsWith('agent-memory-')&&<button type="button" className="secondary-button" disabled={busy||!!editing} onClick={()=>startCorrection(item.id!,item.content!)}>更正这条记忆</button>}
            <button type="button" disabled={busy||!!editing} onClick={()=>void undo(item.id!)}>撤销这条记忆</button></div>}</>}
      {editing&&item.id===editing.cardId&&<form className={styles.editor} onSubmit={event=>{event.preventDefault();void saveCorrection();}}>
        <label htmlFor="memory-correction-content">更正后的完整内容</label>
        <textarea id="memory-correction-content" autoFocus required minLength={3} maxLength={800} rows={5} value={content} disabled={busy} onChange={event=>setContent(event.target.value)}/>
        <label htmlFor="memory-correction-reason">更正原因（可选）</label>
        <input id="memory-correction-reason" maxLength={500} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)}/>
        <label htmlFor="memory-correction-time-mode">业务生效时间</label>
        <select id="memory-correction-time-mode" value={timeMode} disabled={busy} onChange={event=>setTimeMode(event.target.value as 'preserve'|'replace')}>
          <option value="preserve">保留原时间（未知仍为未知）</option><option value="replace">明确更正起止时间</option>
        </select>
        {timeMode==='replace'&&<div className={styles.timeFields}>
          <label htmlFor="memory-valid-from">开始时间（含）<input id="memory-valid-from" type="datetime-local" step="1" value={validFrom} disabled={busy} onChange={event=>setValidFrom(event.target.value)}/></label>
          <label htmlFor="memory-valid-until">结束时间（不含）<input id="memory-valid-until" type="datetime-local" step="1" value={validUntil} disabled={busy} onChange={event=>setValidUntil(event.target.value)}/></label>
          <p>按当前设备时区 {Intl.DateTimeFormat().resolvedOptions().timeZone} 输入。开始留空表示未知；结束留空表示未指定。此选择会替换两项原时间，请完整填写已知范围。</p>
        </div>}
        <p>保留原账户及业务范围。更正只用于内部记忆，原记录与来源继续保留，入库时间由系统记录。保存或取消后可切换分区及记录。</p>
        {editError&&<p role="alert">{editError}</p>}
        <div className={styles.actions}><button className="primary-button" type="submit" disabled={busy||content.trim().length<3||(content.trim()===editing.original&&timeMode==='preserve')}>{busy?'正在保存…':'保存更正'}</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={()=>setEditing(null)}>取消</button></div>
      </form>}
    </article>)}</div>
    <div className={styles.actions}><button type="button" disabled={busy||!!editing||loading||offset===0} onClick={()=>{setOffset(Math.max(0,offset-12));setLoading(true);setEditing(null);}}>上一页</button><span>第 {offset/12+1} 页</span><button type="button" disabled={busy||!!editing||loading||!hasMore} onClick={()=>{setOffset(offset+12);setLoading(true);setEditing(null);}}>下一页</button></div>
    </>}
  </section>;
}
