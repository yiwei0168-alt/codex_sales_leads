"use client";
import {useEffect,useState,useCallback} from 'react';
type Schedule={connection_id:string;enabled:boolean;next_run_at:string;last_status:string|null;last_error:string|null};
export function MailboxDailySync({connectionId,active}:{connectionId:string;active:boolean}){
 const [schedule,setSchedule]=useState<Schedule|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const load=useCallback(async()=>{try{const r=await fetch('/api/mailbox/daily-sync',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();setSchedule(data.schedules.find((s:Schedule)=>s.connection_id===connectionId)??null);setLoaded(true);setError('');}catch{setError('自动同步设置读取失败，请重试');}},[connectionId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function toggle(){setBusy(true);setError('');try{const r=await fetch('/api/mailbox/daily-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connectionId,enabled:!schedule?.enabled})});if(!r.ok)throw Error();await load();}catch{setError('设置未保存，请重试');}finally{setBusy(false);}}
 const state=({queued:'排队中',running:'同步中',completed:'已完成',failed:'同步失败',cancelled:'已取消'} as Record<string,string>)[schedule?.last_status??''];
 return <section className="mailbox-daily-sync" aria-label="每日自动同步"><label><input type="checkbox" checked={schedule?.enabled??false} disabled={!loaded||busy||!active||Boolean(error)} onChange={()=>void toggle()}/>每天早晨 8:00 自动同步</label><p>北京时间 · 同步前一天的收件与已发送邮件，并自动更新已确认客户的时间线。同步不调用模型。</p>{schedule?.enabled&&<small>下次：{new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'short'}).format(new Date(schedule.next_run_at))}（北京时间）{state&&` · 最近任务：${state}`}</small>}{schedule?.last_status==='failed'&&<p role="alert">上次自动同步失败，请在同步记录中检查并按原范围继续。</p>}{error&&<p role="alert">{error} <button type="button" onClick={()=>void load()}>重新读取设置</button></p>}</section>;
}
