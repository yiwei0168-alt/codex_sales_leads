"use client";

import {useId} from 'react';
import type {AgentMode} from '@/lib/assistant/main/mode-prompts';

export const agentModeDescriptions:Record<AgentMode,string>={
  quick:'只读查询已有资料、邮件与客户记录',
  standard:'处理邮件与客户任务，按需搜索公开资料',
  deep:'多步调查、公司分析与候选评估',
};
const options:Array<{value:AgentMode;label:string}>=[
  {value:'quick',label:'快速问答'},
  {value:'standard',label:'标准工作'},
  {value:'deep',label:'深入研究'},
];

export function AgentModePicker({value,onChange,disabled,describedBy}:{value:AgentMode;onChange:(mode:AgentMode)=>void;disabled:boolean;describedBy:string}){
  const groupId=useId();
  return <fieldset className="agent-mode-picker" disabled={disabled} aria-describedby={describedBy}
    onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}}>
    <legend className="agent-mode-legend">任务模式</legend>
    {options.map(option=><label className="agent-mode-option" key={option.value}>
      <input type="radio" name={groupId} value={option.value} checked={value===option.value}
        onChange={()=>onChange(option.value)}/>
      <span>{option.label}</span>
    </label>)}
  </fieldset>;
}
