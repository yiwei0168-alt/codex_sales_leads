/** Conservative attribution boundary for automatic account memory.
 * Mixed or quoted sources need review; matching a verbatim span is insufficient
 * to establish that its first-person speaker is the current user.
 */
export function hasAttributedMemoryText(text:string){
  return /(?:^|\n)\s*(?:>|```|~~~)|<\/?(?:untrusted_text|email|document|quote)\b/i.test(text)
    || /(?:客户|邮件|原文|文档|转述|引用)\s*(?:说|写|提到|表示|内容|原文)?\s*[:：]|(?:客户|邮件|文档)\s*(?:说|写道|提到|表示)/i.test(text)
    || /\b(?:customer|document|email|quote|quoted text)\s*(?:(?:said|says|wrote|reads|states|text)\s*)?[:：]|\b(?:customer|document|email)\s+(?:said|says|wrote|states)\b/i.test(text)
    || /(?:以下|下面|转发|摘录).{0,20}(?:邮件|文档|原文)|\b(?:forwarded|quoted|excerpt|pasted)\b/i.test(text);
}

export function isDirectMemorySpan(text:string,quote:string){
  if(hasAttributedMemoryText(text))return false;
  const position=text.indexOf(quote);if(position<0||text.indexOf(quote,position+1)>=0)return false;
  const before=text.slice(0,position);
  if(/[:：>"“「`]\s*$/.test(before))return false;
  if((before.match(/(?<!\\)"/g)?.length??0)%2===1)return false;
  return before.lastIndexOf('“')<=before.lastIndexOf('”')&&before.lastIndexOf('「')<=before.lastIndexOf('」');
}
