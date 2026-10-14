import { RawJsonDetails } from './raw-json-details';

/** Read-only preview of stored tool evidence; no summary is promoted to a source. */
export function SkillReviewEvidence({receipts}:{receipts:unknown[]}){
 const blocks:Array<{content:string;coordinates:unknown}>=[];
 function coordinateSummary(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))return '坐标见原始结构';
  const row=value as Record<string,unknown>;
  const labels:Record<string,string>={page:'页',slide:'幻灯片',sheet:'工作表',cell:'单元格',cellRange:'单元格范围',unitType:'单元类型',unitIndex:'单元序号',block:'块',blockId:'块 ID'};
  const parts=Object.entries(labels).filter(([key])=>typeof row[key]==='string'||typeof row[key]==='number')
    .map(([key,label])=>`${label}：${String(row[key])}`);
  return parts.length?parts.join(' · '):'坐标见原始结构';
 }
 function visit(value:unknown,depth=0){
  if(depth>10||blocks.length>=24||!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(const child of value)visit(child,depth+1);return;}
  const row=value as Record<string,unknown>;
  if(typeof row.content==='string'&&row.content.trim())blocks.push({content:row.content,coordinates:row.sourceLocation??row.source_location??row.location??row.metadata??null});
  for(const [key,child] of Object.entries(row))if(key!=='content')visit(child,depth+1);
 }
 visit(receipts);
 return <section aria-label="保存的证据"><h4>原文与来源</h4>{blocks.length?blocks.map((block,index)=><div key={index} className="skill-review-source"><p>{block.content.length>12000?`${block.content.slice(0,12000)}\n（本块较长，完整内容见下方记录）`:block.content}</p>{block.coordinates!==null&&<><p className="source-coordinate-summary">{coordinateSummary(block.coordinates)}</p><RawJsonDetails summary={`来源坐标 ${index+1}`} value={block.coordinates}/></>}</div>):<p>本题没有可直接展示的原文块，请核对完整收据。缺少证据不会默认通过。</p>}
  <RawJsonDetails summary="完整证据记录与坐标" value={receipts}/>
 </section>;
}
