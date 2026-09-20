import { Annotation,END,START,StateGraph,type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getPool } from "@/lib/rag/db";
import { boundary,finishRun,InstructionsChangedError } from "./repository";
import { executeRegisteredTool } from "./tool-execution";
import { mailBatchSchema,mailBatchTool } from "./mail-tools";
import type { AgentRun,ExecutionContext,RunStatus,ToolResult } from "./contracts";
const State=Annotation.Root({status:Annotation<RunStatus>(),reply:Annotation<string>(),output:Annotation<ToolResult|undefined>()});
/** Deterministic mail orchestration needs no language-model call. Still uses durable LangGraph and the shared approval executor. */
export function buildMailDeliveryGraph(context:ExecutionContext,run:AgentRun,checkpointer?:BaseCheckpointSaver,
  dependencies={boundary,execute:executeRegisteredTool}) {
  const spec=mailBatchSchema.parse(run.execution_spec);
  return new StateGraph(State)
    .addNode("safe_boundary",async()=>{
      const current=await dependencies.boundary(context);
      if(current.control)return {status:(current.control==="cancel"?"cancelled":"paused") as RunStatus,reply:"发送任务已在执行边界停止；已有回执保留。"};
      if(current.instructions.length)return {status:"partial" as RunStatus,reply:"发送前收到新要求，待发送内容已停止。请按新要求修改并重新确认邮件；已有回执保留。"};
      return {status:"running" as RunStatus};
    })
    .addNode("deliver_exact_items",async()=>{
      let output: ToolResult;
      try { output=await dependencies.execute(mailBatchTool,spec,"reviewed-mail-batch",{...context,instructionIds:[]}); }
      catch(error) {
        if(error instanceof InstructionsChangedError)return {status:"partial" as RunStatus,reply:"批次执行中收到新要求，尚未发送的邮件已停止。请修改并重新确认；已发送的邮件和回执保留。"};
        throw error;
      }
      return {output,status:(output.status==="success"?"completed":output.status==="waiting_approval"?"waiting_user":"partial") as RunStatus,
        reply:output.status==="success"?"邮件已提交给发信服务器，回执已保存。发送成功不表示对方已读。":output.status==="waiting_approval"?"邮件内容需要重新核对确认。":"邮件任务保留了已有结果。部分发送尚未确认，请核对发送记录；不会自动重发。"};
    })
    .addEdge(START,"safe_boundary").addConditionalEdges("safe_boundary",s=>s.status==="running"?"deliver_exact_items":END)
    .addEdge("deliver_exact_items",END).compile({checkpointer,name:"reviewed_mail_delivery"});
}
export async function executeMailDeliveryRun(context:ExecutionContext,run:AgentRun) {
  const graph=buildMailDeliveryGraph(context,run,new PostgresSaver(getPool(),undefined,{schema:"langgraph"}));
  const config={configurable:{thread_id:`reviewed-mail:${context.userId}:${context.runId}`}};
  // Re-enter through the safe boundary on every lease; leaf journals retain
  // completed/unknown external actions even when the last checkpoint was lost.
  const output=await graph.invoke({status:"running",reply:""},config);
  await finishRun(context,output.status,output.reply);
  return {status:output.status};
}
