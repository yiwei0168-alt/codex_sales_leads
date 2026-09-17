export function parseByteRange(value:string|null,size:number):{start:number;end:number}|null{
  if(!value)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(value.trim());if(!match)throw new Error("invalid-range");
  let start=match[1]?Number(match[1]):NaN;let end=match[2]?Number(match[2]):NaN;
  if(Number.isNaN(start)){const suffix=end;if(!Number.isInteger(suffix)||suffix<=0)throw new Error("invalid-range");start=Math.max(0,size-suffix);end=size-1;}
  else if(Number.isNaN(end))end=size-1;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||start>=size)throw new Error("invalid-range");
  return {start,end:Math.min(end,size-1)};
}

export function safeDownloadName(title:string,extension:string):string{
  const base=title.replace(/[\r\n"\\/]/g,"_").trim().slice(0,120)||"knowledge-asset";
  return `${base}${base.toLowerCase().endsWith(extension.toLowerCase())?"":extension}`;
}
