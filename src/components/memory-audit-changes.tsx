type Snapshot=Record<string,unknown>|null;
const kinds:Record<string,string>={'email-style':'邮件风格','cooperation-path-preference':'合作路径偏好','user-approved-marketing-claim':'用户确认业务信息','company-classification':'公司事实/关系记录'};
const descriptors=[
  {key:'kind',source:'kind',label:'类型',labels:kinds},
  {key:'status',source:'status',label:'状态',labels:{active:'启用',archived:'停用'}},
  {key:'usageScope',source:'usage_scope',label:'使用范围',labels:{'internal-learning':'内部学习','external-use-approved':'已授权对外使用'}},
  {key:'marketCodes',source:'market_codes',label:'国家范围'},
  {key:'channelRoles',source:'channel_roles',label:'角色范围'},
  {key:'contentCharacters',source:'content',label:'正文字符数'},
] as const;
function valueText(snapshot:Snapshot,key:string,operation:string,before:boolean):string{
  if(snapshot===null&&((operation==='INSERT'&&before)||(operation==='DELETE'&&!before)))return before?'新增前无记录':'删除后无记录';
  if(!snapshot||!Object.hasOwn(snapshot,key))return '未记录';
  const value=snapshot[key];if(value===null)return '空值';
  if(key==='contentCharacters')return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?`${value} 字符`:'记录格式异常';
  if(key==='marketCodes'||key==='channelRoles')return Array.isArray(value)&&value.every(item=>typeof item==='string')?(value.length?value.join('、'):'未限定'):'记录格式异常';
  const descriptor=descriptors.find(item=>item.key===key);
  return typeof value==='string'&&descriptor&&'labels' in descriptor?(descriptor.labels as Record<string,string>)[value]??'未识别，请查看快照':'记录格式异常';
}
export function MemoryAuditChanges({operation,changedFields,before,after}:{operation:string;changedFields:string[];before:Snapshot;after:Snapshot}){
  const rows=descriptors.filter(field=>{
    const had=Boolean(before&&Object.hasOwn(before,field.key)),has=Boolean(after&&Object.hasOwn(after,field.key));
    if(operation==='INSERT'||operation==='DELETE')return had||has;
    return changedFields.includes(field.source)||had!==has||JSON.stringify(before?.[field.key])!==JSON.stringify(after?.[field.key]);
  });
  return <>
    {changedFields.includes('content')&&<p>正文已修改（不保留历史正文，字符数相同不代表正文相同）。</p>}
    {changedFields.includes('title')&&<p>标题已修改，历史标题未保留。</p>}
    {rows.length?<table className="memory-audit-comparison"><caption>已记录的状态与范围</caption><thead><tr><th scope="col">字段</th><th scope="col">变更前</th><th scope="col">变更后</th></tr></thead><tbody>
      {rows.map(field=><tr key={field.key}><th scope="row">{field.label}</th><td>{valueText(before,field.key,operation,true)}</td><td>{valueText(after,field.key,operation,false)}</td></tr>)}
    </tbody></table>:<p>本条审计没有可展示的状态与范围差异。</p>}
  </>;
}
