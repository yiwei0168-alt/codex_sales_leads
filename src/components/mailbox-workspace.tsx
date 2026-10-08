"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MailboxReader } from "./mailbox-reader";
import { MailboxCustomers } from "./mailbox-customers";
import { WorkspaceDialog } from "./workspace-dialog";
import { MailCompanyLink } from "./mail-company-link";

type AccessMode="read-only"|"send-enabled";
type Connection={id:string;email:string;displayName:string;accessMode:AccessMode;imapHost:string;imapPort:number;smtpHost:string|null;smtpPort:number;smtpVerifiedAt?:string;status:"active"|"error"|"disabled";lastError?:string};
type Message={id:string;subject:string;excerpt:string;direction:"inbound"|"outbound";learning_status:string;learning_error:string|null;screening_bucket:"recommended"|"review"|"ignored";screening_score:number;screening_reasons:string[];thread_key:string|null};
type Candidate={id:string;message_id:string;kind:"company-policy"|"customer-signal"|"email-template";title:string;content:string;excerpt:string;contentHash:string;created_at:string;confidence:number|null;rationale:string|null;model:string|null};
type Status={configured:boolean;kimiConfigured:boolean;messages:number;pendingCandidates:number;screening:{recommended:number;review:number;ignored:number;unscreened:number};latestRun:null|{id:string;status:string;phase:string;processed_count:number;discovered_count:number;imported_count:number;error_message:string|null}};
type MailContent={subject:string;bodyText:string;sender:Array<{name?:string;address:string}>;recipients:Array<{name?:string;address:string}>;sentAt?:string};
const PAGE_SIZE=8;
const kindLabel={"company-policy":"公司政策","customer-signal":"客户信号","email-template":"邮件模板"};

function Pager({page,total,onPage}:{page:number;total:number;onPage:(page:number)=>void}){
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  return <nav className="mailbox-pager" aria-label="列表分页"><span>共 {total} 条 · 第 {page} / {pages} 页</span><button className="secondary-button" disabled={page<=1} onClick={()=>onPage(page-1)}>上一页</button><button className="secondary-button" disabled={page>=pages} onClick={()=>onPage(page+1)}>下一页</button></nav>;
}

function OriginalMail({messageId,onChanged}:{messageId:string;onChanged:()=>void}){
  const [content,setContent]=useState<MailContent|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  async function load(){if(content||loading)return;setLoading(true);setError("");try{const response=await fetch(`/api/mailbox/messages/${messageId}`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.error??"原文读取失败");setContent(body.message);}catch(reason){setError(reason instanceof Error?reason.message:"原文读取失败");}finally{setLoading(false);}}
  return <details className="mailbox-disclosure" onToggle={event=>{if(event.currentTarget.open)void load();}}><summary>查看邮件原文</summary>{loading&&<p role="status">正在读取原文…</p>}{error&&<p role="alert">{error} <button onClick={()=>void load()}>重试</button></p>}{content&&<div className="mailbox-message-content"><p><strong>{content.subject||"无主题"}</strong></p><p>发件：{content.sender.map(item=>item.address).join("、")}</p><p>收件：{content.recipients.map(item=>item.address).join("、")}</p><pre>{content.bodyText}</pre><MailCompanyLink messageId={messageId} onChanged={onChanged}/></div>}</details>;
}

export function MailboxWorkspace(){
  const [connections,setConnections]=useState<Connection[]>([]);
  const [jobs,setJobs]=useState<Array<{id:string;kind:string;status:string;error?:string}>>([]);
  const [jobCounts,setJobCounts]=useState<Array<{status:string;count:number}>>([]);
  const [status,setStatus]=useState<Status|null>(null);
  const [queue,setQueue]=useState<Message[]>([]);
  const [queueTotal,setQueueTotal]=useState(0);
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [tab,setTab]=useState<"learning"|"review"|"inbox"|"sent"|"customers">("inbox");
  const [queuePage,setQueuePage]=useState(1);
  const [reviewPage,setReviewPage]=useState(1);
  const [selectedMessages,setSelectedMessages]=useState<string[]>([]);
  const [selectedCandidates,setSelectedCandidates]=useState<string[]>([]);
  const [managerOpen,setManagerOpen]=useState(false);
  const [provider,setProvider]=useState<"ali"|"custom">("ali");
  const [email,setEmail]=useState("");const [displayName,setDisplayName]=useState("");
  const [securityPassword,setSecurityPassword]=useState("");const [smtpPassword,setSmtpPassword]=useState("");
  const [accessMode,setAccessMode]=useState<AccessMode>("read-only");
  const [imapHost,setImapHost]=useState("imap.qiye.aliyun.com");const [imapPort,setImapPort]=useState(993);
  const [smtpHost,setSmtpHost]=useState("smtp.qiye.aliyun.com");const [smtpPort,setSmtpPort]=useState(465);
  const [folderScope,setFolderScope]=useState("both");const [from,setFrom]=useState("");const [through,setThrough]=useState("");
  const [busy,setBusy]=useState("");const [message,setMessage]=useState("");const [noticeError,setNoticeError]=useState(false);

  const refresh=useCallback(async()=>{
    const [c,s,q,r,j]=await Promise.all([
      fetch("/api/mailbox/connections",{cache:"no-store"}),fetch("/api/mailbox/status",{cache:"no-store"}),
      fetch(`/api/mailbox/learning-queue?page=${queuePage}`,{cache:"no-store"}),fetch(`/api/mailbox/candidates?page=${reviewPage}`,{cache:"no-store"}),
      fetch('/api/mailbox/jobs',{cache:'no-store'}),
    ]);
    if(![c,s,q,r,j].every(response=>response.ok)){setNoticeError(true);setMessage('部分邮箱数据读取失败，请刷新重试');}
    if(j.ok){const data=await j.json();setJobs(data.jobs);setJobCounts(data.counts);}
    if(c.ok)setConnections((await c.json()).connections);
    if(s.ok)setStatus(await s.json());
    if(q.ok){const body=await q.json();setQueue(body.messages);setQueueTotal(body.total);if(queuePage>1&&body.total<=(queuePage-1)*PAGE_SIZE)setQueuePage(queuePage-1);}
    if(r.ok){const body=await r.json();setCandidates(body.candidates);if(reviewPage>1&&body.candidates.length===0)setReviewPage(reviewPage-1);}
  },[queuePage,reviewPage]);
  useEffect(()=>{const timer=window.setTimeout(()=>void refresh().catch(()=>{setNoticeError(true);setMessage('邮箱数据读取失败，请刷新重试');}),0);return()=>window.clearTimeout(timer);},[refresh]);
  useEffect(()=>{const timer=window.setInterval(()=>void refresh().catch(()=>{setNoticeError(true);setMessage('连接中断，正在重试读取进度');}),5000);return()=>window.clearInterval(timer);},[refresh]);

  async function request(url:string,method:"POST"|"PATCH"|"DELETE",body:unknown){const response=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error??"操作失败");return result;}
  async function perform(label:string,operation:()=>Promise<string>){setBusy(label);setMessage("");setNoticeError(false);try{setMessage(await operation());await refresh();}catch(error){setNoticeError(true);setMessage(error instanceof Error?error.message:"操作失败");}finally{setBusy("");}}
  async function connect(event:FormEvent<HTMLFormElement>){event.preventDefault();await perform("connect",async()=>{
    await request("/api/mailbox/connections","POST",{email,displayName:displayName.trim()||email,securityPassword,accessMode,imapHost,imapPort,smtpHost:provider==="ali"||accessMode==="send-enabled"?smtpHost:undefined,smtpPort,smtpPassword:smtpPassword||undefined});
    setSecurityPassword("");setSmtpPassword("");return `“${displayName||email}”连接成功；${accessMode==="send-enabled"?"SMTP 已验证，可用于已确认的发信":"保持只读"}。`;
  });}
  async function sync(id:string){await perform("sync",async()=>{await request("/api/mailbox/sync","POST",{connectionId:id,folderScope,from:from||undefined,through:through||undefined});return '同步已排队，后台将分批读取所选日期范围。关闭页面不影响同步。';});}
  async function saveSettings(connection:Connection,mode:AccessMode,name:string){await perform(`settings:${connection.id}`,async()=>{await request(`/api/mailbox/connections/${connection.id}`,"PATCH",{action:"settings",displayName:name,accessMode:mode});return "邮箱名称和权限已保存。";});}
  async function disconnect(connection:Connection){if(!window.confirm(`断开 ${connection.displayName}？本地已导入数据保留，凭据将清除。`))return;await perform(`disconnect:${connection.id}`,async()=>{await request(`/api/mailbox/connections/${connection.id}`,"PATCH",{action:"disconnect"});return "连接已断开，数据保留。";});}
  async function remove(connection:Connection){if(!window.confirm(`永久删除 ${connection.displayName} 的本地导入邮件和待审候选？此操作不可撤销，远程邮箱不受影响。`))return;await perform(`remove:${connection.id}`,async()=>{await request(`/api/mailbox/connections/${connection.id}`,"DELETE",{confirm:"DELETE_MAILBOX_DATA"});return "本地邮箱数据已删除。";});}
  async function decideMessages(ids:string[],action:"authorize"|"skip"){
    if(!ids.length)return;
    if(action==="authorize"&&!window.confirm(`将所选 ${ids.length} 封邮件分别脱敏后发送给 Kimi？每封都有独立外发审计。`))return;
    await perform(`messages:${action}`,async()=>{const result=await request("/api/mailbox/screening","POST",{action,messageIds:ids,consent:action==="authorize"});const failedIds=(result.results??[]).filter((item:{status:string})=>item.status==='failed').map((item:{id:string})=>item.id);setSelectedMessages(failedIds);return action==='authorize'?`已排队 ${result.queued} 封，后台逐封处理；每封保留独立授权记录。`:`处理 ${result.processed??0} 封，失败 ${result.failed??0} 封，失败项保留选择。`;});
  }
  async function decideCandidates(items:Candidate[],action:"approved"|"rejected"){
    if(!items.length)return;
    if(action==="approved"&&!window.confirm(`批准所选 ${items.length} 条内容写入你的私有知识库？请确认已逐条核对内容。`))return;
    await perform(`candidates:${action}`,async()=>{const result=await request("/api/mailbox/candidates/batch","POST",{items:items.map(item=>({id:item.id,contentHash:item.contentHash})),status:action,confirmed:action==="approved"});setSelectedCandidates((result.results??[]).filter((item:{result:string})=>item.result!=="saved").map((item:{id:string})=>item.id));return `审核成功 ${result.processed??0} 条，失败 ${result.failed??0} 条。`;});
  }
  const selectedCandidateItems=candidates.filter(item=>selectedCandidates.includes(item.id));
  function changeQueuePage(page:number){setQueuePage(page);}
  function changeReviewPage(page:number){setSelectedCandidates([]);setReviewPage(page);}

  return <div className="mailbox-workspace">
    <header className="mailbox-topbar panel">
      <span className="mailbox-connection-label">{connections.filter(item=>item.status==="active").length} 个邮箱已连接{jobCounts.some(item=>['failed','uncertain'].includes(item.status)&&item.count>0)?' · 后台任务需处理':jobCounts.some(item=>['queued','running'].includes(item.status)&&item.count>0)?' · 后台处理中':''}</span>
      <button className="secondary-button" aria-expanded={managerOpen} onClick={()=>setManagerOpen(value=>!value)}>{managerOpen?"收起邮箱管理":"管理 / 连接邮箱"}</button>
      {managerOpen&&<WorkspaceDialog title="管理 / 连接邮箱" drawer onClose={()=>setManagerOpen(false)}><div className="mailbox-manager">
      {jobCounts.length>0&&<details className="mailbox-job-progress"><summary>后台任务：{jobCounts.map(item=>`${({queued:'排队',running:'处理中',completed:'完成',failed:'失败',uncertain:'待核实',cancelled:'已取消'} as Record<string,string>)[item.status]??item.status} ${item.count}`).join(' / ')}</summary><p>处理中邮件不会因刷新页面重复外发。结果未明时先核对原收据，不自动重试。</p><button disabled={Boolean(busy)} onClick={()=>void perform('cancel',async()=>{const result=await request('/api/mailbox/jobs','POST',{action:'cancel-queued'});return `已取消 ${result.cancelled} 项排队任务，已开始的任务继续完成。`;})}>取消尚未开始的任务</button>{jobs.filter(item=>item.error).map(item=><p role="status" key={item.id}>{item.kind==='learn'?'学习':item.kind==='timeline'?'时间线':'同步'}：{item.error}{item.status==='uncertain'&&<button disabled={Boolean(busy)} onClick={()=>void perform('reconcile',async()=>{const result=await request('/api/mailbox/jobs','POST',{action:'reconcile',id:item.id});return result.message;})}>核对原收据</button>}</p>)}</details>}
      <div className="mailbox-summary"><span><b>{status?.messages??0}</b> 已保存邮件</span><span><b>{queueTotal}</b> 待学习</span><span><b>{status?.pendingCandidates??0}</b> 待审核内容</span>{status?.latestRun&&<span className="mailbox-run-state" title={status.latestRun.error_message??undefined}>最近同步：{status.latestRun.status==="running"?`进行中 ${status.latestRun.processed_count}/${status.latestRun.discovered_count}`:status.latestRun.status==="failed"?"失败 · 查看邮箱管理后重试":`已完成 · 新增 ${status.latestRun.imported_count} 封`}</span>}</div>

        {message&&<p role={noticeError?"alert":"status"} className={noticeError?"workspace-error":""}>{message}</p>}

        <div className="mailbox-actions">{[7,30,90].map(days=><button key={days} onClick={()=>{setFrom(new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10));setThrough(new Date().toISOString().slice(0,10));}}>最近 {days} 天</button>)}</div><div className="mailbox-sync-options"><label>同步范围<select value={folderScope} onChange={event=>setFolderScope(event.target.value)}><option value="both">收件箱及已发送</option><option value="inbox">仅收件箱</option><option value="sent">仅已发送</option></select></label><label>开始日期<input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label><label>结束日期<input type="date" min={from} value={through} onChange={event=>setThrough(event.target.value)}/></label><small>留空默认近 180 天，后台分批同步全部范围。</small></div>
        <div className="mailbox-manager-list"><strong>已添加邮箱</strong>{connections.map(item=><ConnectionSettings key={`${item.id}:${item.displayName}:${item.accessMode}`} connection={item} busy={Boolean(busy)} onSave={saveSettings} onSync={sync} onDisconnect={disconnect} onRemove={remove}/>)}{!connections.length&&<p className="subtle">尚未连接邮箱。</p>}</div>
        <details className="mailbox-disclosure"><summary>添加邮箱</summary><div className="mailbox-manager-head"><strong>连接邮箱</strong><small>支持标准 IMAP/SMTP 和客户端专用密码；OAuth 邮箱暂不支持。</small></div>
        {!status?.configured&&<p className="login-config-error">服务端未配置 MAILBOX_CREDENTIAL_KEY。</p>}
        <form className="mailbox-form mailbox-connect-form" onSubmit={connect}>
          <label>邮箱类型<select value={provider} onChange={event=>{const next=event.target.value as "ali"|"custom";setProvider(next);setImapHost(next==="ali"?"imap.qiye.aliyun.com":"");setSmtpHost(next==="ali"?"smtp.qiye.aliyun.com":"");}}><option value="ali">阿里邮箱（预填服务器）</option><option value="custom">其他 IMAP/SMTP 邮箱</option></select></label>
          <label>自定义名称<input value={displayName} maxLength={80} onChange={event=>setDisplayName(event.target.value)} placeholder="例如：欧洲销售邮箱" required/></label>
          <label>邮箱地址<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="username" placeholder="name@example.com" required/></label>
          <label>客户端专用密码<input type="password" value={securityPassword} onChange={event=>setSecurityPassword(event.target.value)} autoComplete="new-password" required/></label>
          <label>连接权限<select value={accessMode} onChange={event=>setAccessMode(event.target.value as AccessMode)}><option value="read-only">只读（仅同步）</option><option value="send-enabled">可发信（需验证 SMTP）</option></select></label>
          <label>IMAP 服务器<input value={imapHost} onChange={event=>setImapHost(event.target.value)} placeholder="imap.example.com" required/></label>
          <label>IMAP 端口<input type="number" min={1} max={65535} value={imapPort} onChange={event=>setImapPort(Number(event.target.value))} required/></label>
          {accessMode==="send-enabled"&&<><label>SMTP 服务器<input value={smtpHost} onChange={event=>setSmtpHost(event.target.value)} placeholder="smtp.example.com" required/></label><label>SMTP 端口<input type="number" min={1} max={65535} value={smtpPort} onChange={event=>setSmtpPort(Number(event.target.value))} required/></label><label>SMTP 专用密码（可选）<input type="password" value={smtpPassword} onChange={event=>setSmtpPassword(event.target.value)} placeholder="留空则与 IMAP 相同" autoComplete="new-password"/></label></>}
          <button className="primary-button" disabled={Boolean(busy)||!status?.configured}>{busy==="connect"?"正在验证…":"验证并连接"}</button>
        </form></details>

      </div></WorkspaceDialog>}
    </header>
    {message&&<div className={`mailbox-notice ${noticeError?"workspace-error":""}`} role={noticeError?"alert":"status"}><span>{message}</span><button aria-label="关闭提示" onClick={()=>setMessage("")}>×</button></div>}
    <section className="mailbox-main panel">
      <div className="mailbox-tabs" role="tablist" aria-label="邮箱工作区"><button role="tab" aria-selected={tab==="inbox"} onClick={()=>setTab("inbox")}>收件箱</button><button role="tab" aria-selected={tab==="sent"} onClick={()=>setTab("sent")}>已发送</button><button role="tab" aria-selected={tab==="customers"} onClick={()=>setTab("customers")}>客户与时间线</button><button role="tab" aria-selected={tab==="learning"} onClick={()=>setTab("learning")}>私有学习候选 <em>{queueTotal}</em></button><button role="tab" aria-selected={tab==="review"} onClick={()=>setTab("review")}>待审核内容 <em>{status?.pendingCandidates??0}</em></button></div>
      {tab==="learning"?<div className="mailbox-tab-content" role="tabpanel">
        <div className="mailbox-actionbar"><div><strong>待学习邮件</strong><small>先本地筛选，选择后明确授权，后台逐封处理。</small></div><div className="mailbox-actions"><button className="secondary-button" disabled={Boolean(busy)||!status?.screening.unscreened} onClick={()=>void perform("rescreen",async()=>{await request("/api/mailbox/screening","POST",{action:"rescreen"});return "本地筛选已完成。";})}>本地重新筛选</button><button className="secondary-button" disabled={Boolean(busy)||!selectedMessages.length} onClick={()=>void decideMessages(selectedMessages,"skip")}>跳过所选</button><button className="primary-button" disabled={Boolean(busy)||!selectedMessages.length||!status?.kimiConfigured} onClick={()=>void decideMessages(selectedMessages,"authorize")}>授权所选 {selectedMessages.length}</button></div></div>
        <div className="mailbox-selectbar"><label><input type="checkbox" ref={node=>{if(node)node.indeterminate=queue.some(item=>selectedMessages.includes(item.id))&&!queue.every(item=>selectedMessages.includes(item.id));}} checked={queue.length>0&&queue.every(item=>selectedMessages.includes(item.id))} onChange={event=>setSelectedMessages(event.target.checked?[...new Set([...selectedMessages,...queue.map(item=>item.id)])]:selectedMessages.filter(id=>!queue.some(item=>item.id===id)))}/> 选择当前页</label><button disabled={Boolean(busy)} onClick={()=>void perform('select-all',async()=>{const response=await fetch('/api/mailbox/learning-queue?select=all');if(!response.ok)throw new Error('Selection unavailable');const data=await response.json();setSelectedMessages(data.ids);return `已固定选择 ${data.ids.length} 封，后续新邮件不会自动加入。`;})}>选择全部待学习</button><button onClick={()=>setSelectedMessages([])}>清空选择</button><span>已选 {selectedMessages.length} 封，支持跨页选择，不限批次数量。</span></div>
        <div className="mailbox-scroll-list">{queue.map(item=><article className="mailbox-row" key={item.id}><label className="mailbox-row-check"><input type="checkbox" checked={selectedMessages.includes(item.id)} onChange={event=>setSelectedMessages(ids=>event.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/><span className={`mail-screening-state ${item.screening_bucket}`}>{item.screening_bucket==="recommended"?"推荐":item.screening_bucket==="review"?"待确认":"低优先"} {item.screening_score}</span></label><div className="mailbox-row-main"><strong>{item.subject||"无主题邮件"}</strong><p>{item.excerpt||"无正文预览"}</p><small>{item.direction==="inbound"?"收件":"已发送"} · {item.learning_status==="failed"?"上次学习失败":"待授权"}{item.learning_error&&` · ${item.learning_error}`}</small><OriginalMail messageId={item.id} onChanged={()=>void refresh()}/></div><div className="mailbox-row-actions"><button className="secondary-button" disabled={Boolean(busy)} onClick={()=>void decideMessages([item.id],"skip")}>跳过</button><button className="primary-button" disabled={Boolean(busy)||!status?.kimiConfigured} onClick={()=>void decideMessages([item.id],"authorize")}>授权学习</button></div></article>)}{!queue.length&&<div className="mailbox-empty">当前没有待学习邮件。连接邮箱并同步后，新邮件会出现在这里。</div>}</div>
        <Pager page={queuePage} total={queueTotal} onPage={changeQueuePage}/>
      </div>:tab==="review"?<div className="mailbox-tab-content" role="tabpanel">
        <div className="mailbox-actionbar"><div><strong>知识入库审核</strong><small>提取内容只有经你批准才会进入私有知识库。</small></div><div className="mailbox-actions"><button className="secondary-button" disabled={Boolean(busy)||!selectedCandidates.length} onClick={()=>void decideCandidates(selectedCandidateItems,"rejected")}>批量拒绝（{selectedCandidates.length}）</button><button className="primary-button" disabled={Boolean(busy)||!selectedCandidates.length} onClick={()=>void decideCandidates(selectedCandidateItems,"approved")}>批量批准（{selectedCandidates.length}）</button></div></div>
        <div className="mailbox-selectbar"><label><input type="checkbox" checked={candidates.length>0&&candidates.every(item=>selectedCandidates.includes(item.id))} onChange={event=>setSelectedCandidates(event.target.checked?candidates.map(item=>item.id):[])}/> 选择当前页</label><span>每批最多当前页 8 条；内容变化时服务端会拒绝旧版本决定。</span></div>
        <div className="mailbox-scroll-list mailbox-review-list">{candidates.map(item=><article className="mailbox-review-card" key={item.id}><div className="mailbox-review-head"><label><input type="checkbox" checked={selectedCandidates.includes(item.id)} onChange={event=>setSelectedCandidates(ids=>event.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/><span className="tag neutral">{kindLabel[item.kind]}</span></label><small>{item.created_at.slice(0,10)}</small></div><strong>{item.title||"未命名内容"}</strong><p>{item.excerpt}</p><details className="mailbox-disclosure"><summary>查看完整提取内容</summary><div className="mailbox-artifact-content">{item.content}</div></details><OriginalMail messageId={item.message_id} onChanged={()=>void refresh()}/><div className="mailbox-review-footer"><small>{item.model??"Kimi"}{item.confidence!==null&&` · 置信度 ${Math.round(item.confidence*100)}%`}</small><div><button className="secondary-button" disabled={Boolean(busy)} onClick={()=>void decideCandidates([item],"rejected")}>拒绝</button><button className="primary-button" disabled={Boolean(busy)} onClick={()=>void decideCandidates([item],"approved")}>批准</button></div></div></article>)}{!candidates.length&&<div className="mailbox-empty">当前页没有待审核内容。学习提取完成后，候选会显示在这里。</div>}</div>
        <Pager page={reviewPage} total={status?.pendingCandidates??0} onPage={changeReviewPage}/>
      </div>:tab==="customers"?<MailboxCustomers/>:<MailboxReader key={tab} direction={tab==="sent"?"outbound":"inbound"}/>}
    </section>
  </div>;
}

function ConnectionSettings({connection,busy,onSave,onSync,onDisconnect,onRemove}:{connection:Connection;busy:boolean;onSave:(connection:Connection,mode:AccessMode,name:string)=>Promise<void>;onSync:(id:string)=>Promise<void>;onDisconnect:(connection:Connection)=>Promise<void>;onRemove:(connection:Connection)=>Promise<void>}){
  const [name,setName]=useState(connection.displayName);const [mode,setMode]=useState<AccessMode>(connection.accessMode);
  return <article className="mailbox-managed-account"><div className="mailbox-managed-fields"><label>名称<input value={name} maxLength={80} onChange={event=>setName(event.target.value)}/></label><label>权限<select value={mode} onChange={event=>setMode(event.target.value as AccessMode)}><option value="read-only">只读</option><option value="send-enabled" disabled={!connection.smtpHost}>可发信</option></select></label><div><strong>{connection.email}</strong><small>{connection.status==="active"?`${connection.imapHost}:${connection.imapPort}`:connection.lastError??"已断开"}</small></div></div><div className="mailbox-managed-actions"><button className="secondary-button" disabled={busy||connection.status!=="active"||!name.trim()} onClick={()=>void onSave(connection,mode,name.trim())}>保存设置</button><button className="secondary-button" disabled={busy||connection.status!=="active"} onClick={()=>void onSync(connection.id)}>同步</button><button className="secondary-button" disabled={busy||connection.status!=="active"} onClick={()=>void onDisconnect(connection)}>断开</button><button className="secondary-button mailbox-delete-button" disabled={busy} onClick={()=>void onRemove(connection)}>删除本地数据</button></div></article>;
}
