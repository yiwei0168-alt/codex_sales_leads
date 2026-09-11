"use client";
import { useEffect,useState } from "react";
import { feedStatus,taskKindLabels,type TaskFeedItem } from "@/lib/assistant/task-feed";
import { ContactEnrichmentProgress } from "./contact-enrichment-progress";
const metricLabels:Record<string,string>={target:"目标公司数",saved:"保存公司数",processed:"已处理公司数",credits:"搜索/补证额度",revision:"草稿版本",model:"生成模型",promptTokens:"输入 tokens",completionTokens:"输出 tokens",sentAt:"服务器接受时间",followUp:"是否跟进邮件"};
export function TaskCenter(){
  const [items,setItems]=useState<TaskFeedItem[]>([]);const [offset,setOffset]=useState(0);const [more,setMore]=useState(false);
  const [kind,setKind]=useState("all");const [country,setCountry]=useState("all");const [countryInput,setCountryInput]=useState("");const [status,setStatus]=useState("all");
  const [revision,setRevision]=useState(0);const [error,setError]=useState("");const [loading,setLoading]=useState(true);const [contacts,setContacts]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let inFlight=false;
    async function load(){if(inFlight)return;inFlight=true;
      try{const response=await fetch(`/api/tasks?${new URLSearchParams({kind,country,status,offset:String(offset)})}`,{signal:controller.signal,cache:"no-store"});
        if(!response.ok)throw new Error();const data=await response.json() as {items:TaskFeedItem[];hasMore:boolean};if(controller.signal.aborted)return;
        setItems(data.items);setMore(data.hasMore);setError("");setLoading(false);
        if(data.items.some(item=>["running","confirmed","sending"].includes(item.status)))timer=setTimeout(()=>{if(document.visibilityState==="visible")void load();},5000);
      }catch{if(!controller.signal.aborted){setError("任务列表读取失败，请重试");setLoading(false);}}finally{inFlight=false;}}
    function visible(){if(document.visibilityState==="visible"){if(timer)clearTimeout(timer);void load();}}
    document.addEventListener("visibilitychange",visible);void load();return()=>{controller.abort();if(timer)clearTimeout(timer);document.removeEventListener("visibilitychange",visible);};
  },[kind,country,status,offset,revision]);
  function reset(){setOffset(0);setItems([]);setLoading(true);setRevision(value=>value+1);}
  function page(next:number){setItems([]);setLoading(true);setOffset(next);}
  return <section className="panel"><h2>任务中心</h2><p>搜索、联系人补充、开发草稿与邮件发送 · 按记录创建时间排列，每页 50 条。筛选覆盖全部历史，不触发付费执行。</p>
    <label>类型<select value={kind} onChange={event=>{setKind(event.target.value);reset();}}><option value="all">全部类型</option>{Object.entries(taskKindLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
    <label>状态<select value={status} onChange={event=>{setStatus(event.target.value);reset();}}><option value="all">全部状态</option><option value="active">运行中</option><option value="attention">待确认 / 异常</option><option value="finished">已结束 / 已产出</option></select></label>
    <form onSubmit={event=>{event.preventDefault();const value=countryInput.trim().toUpperCase();if(value&&!/^[A-Z]{2}$/.test(value)){setError("请输入两位国家代码，如 GB、MX；留空为全部");return;}setCountry(value||"all");reset();}}><label>国家代码<input maxLength={2} value={countryInput} onChange={event=>setCountryInput(event.target.value)} placeholder="全部"/></label><button>筛选国家</button></form>
    <button onClick={()=>{setCountry("unknown");setCountryInput("");reset();}}>未标注国家 / 混合批次</button><button onClick={()=>setRevision(value=>value+1)}>刷新</button><p>当前国家范围：{country==="all"?"全部":country==="unknown"?"未标注 / 混合":country}</p>
    {error&&<p role="alert">{error}</p>}{loading&&<p>正在读取…</p>}{!loading&&!error&&!items.length&&<p>暂无匹配记录。</p>}
    {items.map(item=><article className="opportunity-card" key={`${item.kind}:${item.id}`}><strong>{item.title}</strong><p>{taskKindLabels[item.kind]} · {feedStatus(item)} · {item.country??"未标注 / 混合国家"}</p><small>创建 {item.createdAt} · 更新 {item.updatedAt}</small>
      <details><summary>任务指标</summary><dl>{Object.entries(item.metrics).map(([key,value])=><div key={key}><dt>{metricLabels[key]??key}</dt><dd>{value===null||value===undefined?"尚无记录":typeof value==="boolean"?value?"是":"否":String(value)}</dd></div>)}</dl></details>
      {item.kind==="search"&&<a href={`/tasks/${item.id}`}>查看搜索详情</a>}
    </article>)}
    <p>草稿记录不证明实际发信；服务器接受不代表送达或已读。搜索额度不等于美元总成本。联系人旧批次没有可靠国家快照，暂列为未标注 / 混合。</p>
    <button disabled={loading||offset===0} onClick={()=>page(Math.max(0,offset-50))}>上一页</button><span>第 {offset/50+1} 页</span><button disabled={loading||!more} onClick={()=>page(offset+50)}>下一页</button>
    <details onToggle={event=>setContacts(event.currentTarget.open)}><summary>最近联系人批次实时明细（独立于上述筛选）</summary>{contacts&&<ContactEnrichmentProgress/>}</details>
  </section>;
}
