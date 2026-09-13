export const TEXT_OUTPUT_LIMITS={"rag-answer":8192,"hybrid-synthesis":8192,"lead-playbook":4096} as const;
type TextTask=keyof typeof TEXT_OUTPUT_LIMITS;
const environmentKeys:Record<TextTask,string>={"rag-answer":"RAG_ANSWER_MAX_OUTPUT_TOKENS","hybrid-synthesis":"HYBRID_SYNTHESIS_MAX_OUTPUT_TOKENS","lead-playbook":"LEAD_PLAYBOOK_MAX_OUTPUT_TOKENS"};
export function textOutputLimit(task:TextTask):number{
  const raw=process.env[environmentKeys[task]]?.trim();
  if(!raw)return TEXT_OUTPUT_LIMITS[task];
  if(!/^[1-9]\d{0,6}$/.test(raw)||Number(raw)>1000000)throw new Error("Invalid configured text output limit");
  return Number(raw);
}
/** HTTP success or valid JSON is not proof of a completed model answer. */
export function textOutputCompletion(task:string|undefined,value:unknown):"complete"|"incomplete"|undefined{
  if(!task||!Object.hasOwn(TEXT_OUTPUT_LIMITS,task))return undefined;
  const body=value&&typeof value==="object"?value as Record<string,unknown>:{};
  if(!Array.isArray(body.choices)||body.choices.length!==1)return "incomplete";
  const choice=body.choices[0];
  return choice?.finish_reason==="stop"&&typeof choice.message?.content==="string"&&choice.message.content.trim()
    &&!choice.message.refusal?"complete":"incomplete";
}
