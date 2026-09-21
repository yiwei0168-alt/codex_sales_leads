/** Small, safe renderer for saved text and Markdown tables; never interprets HTML. */
export function SavedKnowledgeText({text}:{text:string}){
  const lines=text.split("\n"), blocks:React.ReactNode[]=[];
  const cells=(line:string)=>line.trim().replace(/^\|/ ,"").replace(/\|$/,"").split("|").map(value=>value.trim());
  for(let index=0;index<lines.length;){
    const line=lines[index];
    if(line.includes("|")&&/^\s*\|?\s*:?-{3,}/.test(lines[index+1]??"")){
      const head=cells(line),rows:string[][]=[];index+=2;
      while(index<lines.length&&lines[index].includes("|"))rows.push(cells(lines[index++]));
      blocks.push(<div className="saved-table-scroll" key={`table-${index}`} tabIndex={0} role="region" aria-label="资料表格"><table><thead><tr>{head.map((cell,i)=><th key={i}>{cell}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>);
    }else if(/^#{1,6}\s/.test(line)){blocks.push(<h3 key={index++}>{line.replace(/^#{1,6}\s/,"")}</h3>);}
    else {const start=index,paragraph:string[]=[];do{paragraph.push(lines[index++]);}while(index<lines.length&&lines[index].trim()&&!/^#{1,6}\s/.test(lines[index])&&!(lines[index].includes("|")&&/^\s*\|?\s*:?-{3,}/.test(lines[index+1]??"")));if(paragraph.join("").trim())blocks.push(<p key={start}>{paragraph.join("\n")}</p>);}
  }
  return <>{blocks}</>;
}
