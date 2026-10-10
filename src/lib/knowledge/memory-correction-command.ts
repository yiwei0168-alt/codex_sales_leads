/** A deliberately narrow explicit command, not semantic matching of arbitrary conversation. */
export function parseMemoryCorrectionCommand(text:string):{recognized:boolean;correction?:{oldContent:string;content:string}}{
  const value=text.trim();
  if(!/^(?:更正记忆\s*[:：]|correct memory\s*:)/i.test(value))return {recognized:false};
  const matched=value.match(/^更正记忆\s*[:：]\s*“([^“”\r\n]{3,800})”\s*改为\s*“([^“”\r\n]{3,800})”\s*[。.!！]?$/)
    ??value.match(/^Correct memory\s*:\s*"([^"\r\n]{3,800})"\s+to\s+"([^"\r\n]{3,800})"\s*[.!]?$/i);
  if(!matched)return {recognized:true};
  const [,oldContent,content]=matched;
  if(oldContent.trim().length<3||content.trim().length<3)return {recognized:true};
  // This path cannot redefine formal policy, authorization or effective dates.
  if(/(?:policy|score|approv|permission|system prompt|ignore|override|bypass|effective|from now|starting|since|until)|政策|评分|批准|权限|系统提示|忽略|绕过|生效|从今|从现在|以后|自从|截至|截止|改为从/i.test(content))return {recognized:true};
  return {recognized:true,correction:{oldContent:oldContent.trim(),content:content.trim()}};
}
