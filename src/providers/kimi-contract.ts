/** K3 counts reasoning + final output in max_completion_tokens. Keep existing numeric limits. */
export function kimiOutputLimit(model:string,limit:number):{max_completion_tokens:number}|{max_tokens:number}{
  if(!Number.isSafeInteger(limit)||limit<1||limit>1048576)throw new Error("Kimi output limit is invalid");
  return /^kimi-k3(?:$|[-.])/i.test(model)?{max_completion_tokens:limit}:{max_tokens:limit};
}
export function isKimiK3(model:string){return /^kimi-k3(?:$|[-.])/i.test(model);}
