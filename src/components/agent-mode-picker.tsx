"use client";

import {useId} from 'react';
import {agentModeOptions, type AgentMode} from '@/lib/assistant/main/mode-contract';

export function AgentModePicker({value,onChange,disabled,describedBy}:{value:AgentMode;onChange:(mode:AgentMode)=>void;disabled:boolean;describedBy:string}){
  const groupId=useId();
  return <fieldset className="agent-mode-picker" disabled={disabled} aria-describedby={describedBy}
    onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}}>
    <legend className="agent-mode-legend">任务模式：模型与可用能力</legend>
    {agentModeOptions.map(option=><label className="agent-mode-option" key={option.value}>
      <input type="radio" name={groupId} value={option.value} checked={value===option.value}
        onChange={()=>onChange(option.value)}/>
      <span>{option.label}</span>
    </label>)}
  </fieldset>;
}

export function AgentModeHint({mode, id}: {mode: AgentMode; id: string}) {
  return <div className="agent-mode-guidance" id={id}>
    <p className="agent-mode-hint" aria-live="polite"><strong>任务模式：</strong>{agentModeOptions.find(option=>option.value===mode)?.description}<span>仅用于新任务</span></p>
    <details className="agent-execution-hint">
      <summary>执行方式由系统自动选择</summary>
      <p>上面的模式决定主模型与可用能力，不对应某一种执行路径。系统可使用固定流程、程序执行（interpreter）或动态规划，也可在需要进一步判断时交回主模型。自动选择不会扩大当前模式的权限。</p>
    </details>
  </div>;
}
