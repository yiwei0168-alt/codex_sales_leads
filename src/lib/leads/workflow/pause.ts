export class WorkflowPausedError extends Error {
  constructor(){super("工作流已在阶段边界暂停，已完成的 checkpoint 保留；恢复前请确认后续可能产生的费用。");this.name="WorkflowPausedError";}
}
export function checkpointInvocation(snapshot:{values?:Record<string,unknown>;next?:readonly string[]},userId:string,actionId:string){
  const values=snapshot.values;
  if(!values||!Object.keys(values).length)return "fresh" as const;
  if(values.userId!==userId||values.actionId!==actionId)throw new Error("Checkpoint ownership mismatch");
  if(snapshot.next?.length)return "resume" as const;
  if(values.result)return "complete" as const;
  throw new Error("Checkpoint has no resumable stage or completed result");
}
