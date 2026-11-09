import { defineTool } from './tool-definition';
import { workflowInput, programInput, HYBRID_LEAVES, PROGRAM_LEAVES, type HybridLeaf } from './hybrid-contracts';
import { executeHybridRead } from './hybrid-execution';
import { executeProgrammatic } from './programmatic-execution';
import type { ExecutionContext, ModelMessage } from './contracts';
import { readInterpreterReceipt } from './interpreter-receipts';
import { PROGRAM_PROJECTION_HELP } from './program-projection-policy';

const interpreterHelp = ' Date and clocks are unavailable. Use tools.time(timestamp) -> {epochMs,utcIso} for deterministic sorting or UTC dates. Supply YYYY-MM-DD[T or space]HH:mm:ss[.SSS] with Z or an explicit numeric offset (+HH, +HHmm, +HH:mm); no timezone guessing. Example: tools.time(event.time).epochMs. To recompute from previously saved evidence, use tools.receipt(originalLeafCallId) -> full ToolResult, including successful leaves inside a partial program. Only same-account, same-task, current permitted leaf receipts are accepted and revalidated. Never paste copied results as proof; receipt lookup does not repeat the original tool or provider call. Reused evidence counts toward the segment evidence limit.';

async function dependencies(context: ExecutionContext, capabilities = HYBRID_LEAVES) {
  const [{ dispatchTool }, { availableTools }, { assertCurrentKnowledgeMessages,KnowledgeSourceChangedError }, { assertCurrentMemoryMessages },{assertCurrentPrivateReplayMessages}] = await Promise.all([
    import('./executor'), import('./tools'), import('./knowledge-message-guard'), import('./memory-message-guard'),
    import('./private-replay-guard'),
  ]);
  return { dispatch: dispatchTool,
    readReceipt: (callId: string) => readInterpreterReceipt(context, callId, capabilities, () => availableTools(context)),
    allowed: new Set(availableTools(context).filter(t => capabilities.has(t.id) &&
      (t.effect === 'read' || (t.id === 'evidence_collect' && t.effect === 'reversible'))).map(t => t.id)),
    validate: async (leaves: HybridLeaf[]) => {
      if(!leaves.length)return;
      const messages: ModelMessage[] = leaves.flatMap(leaf => [
        { role: 'assistant', content: null, tool_calls: [{ id: leaf.key, type: 'function',
          function: { name: 'execute_tool', arguments: JSON.stringify({ tool: leaf.tool, arguments: leaf.arguments }) } }] },
        { role: 'tool', tool_call_id: leaf.key, content: JSON.stringify(leaf.output) },
      ]);
      await assertCurrentKnowledgeMessages(context.userId, messages, context.knowledgeScope);
      await assertCurrentMemoryMessages(context.userId, messages);
      const successful=messages.filter(m=>m.role!=='tool'||(['success','partial'].includes(JSON.parse(m.content??'{}').status)&&JSON.parse(m.content??'{}').data!=null));
      try{await assertCurrentPrivateReplayMessages(context.userId,successful);}catch{throw new KnowledgeSourceChangedError();}
    },
  };
}
export const hybridTools = [
  defineTool({ id: 'programmatic_tools', effect: 'reversible', cost: 'unknown', recovery: 'composite', input: programInput,
    description: `Execute a bounded multi-tool segment in isolated synchronous JavaScript. Main model selects the strategy and describes leaf schemas first. tools.call(id,args) returns a full ToolResult; tools.parallel([{tool,arguments},...]) runs independent requests with concurrency 3 in input order; tools.workflow(args) runs local recipes. tools.handoff(reason,value) immediately stops and returns evidence to the main model for semantic decisions, conflicting evidence or new strategy; it cannot be caught to continue. Return compact JSON retaining source IDs/quotes/callIds. Up to 24 calls, 180 seconds between boundaries, no await/Promise, network/files/shell/secrets. Each leaf enforces account, mode, journal and budget independently. Allowed: ${[...PROGRAM_LEAVES].join(', ')}. Research pipeline: company_research -> evidence_collect -> role_correct -> company_score -> score_review, passing each saved sourceCallId. Stop at partial/missing/unknown outcomes and reuse receipts. Specialist tools retain model costs. No send, customer mutation, official score publication or nested jobs. Code handles loops/joins/parallelism; main model handles new semantic decisions and final answer.`,
    execute: async (input, context) => executeProgrammatic(input, context, await dependencies(context, PROGRAM_LEAVES)) }),
  defineTool({ id: 'workflow_read', recovery: 'composite', input: workflowInput,
    description: 'Reviewed local read recipes: customer_recent resolves one unambiguous company, reads its first timeline page and up to 8 latest original mails; knowledge_evidence retrieves up to 8 evidence blocks. Reuse returned reads, disclose unread scope and continue with dynamic tools for unmet requirements. Never sends, syncs, merges or scores.',
    execute: async (input, context) => executeHybridRead('workflow', input, context, await dependencies(context)) }),
  defineTool({ id: 'programmatic_read', recovery: 'composite', input: programInput,
    description: `Run bounded synchronous JavaScript in an isolated QuickJS WASM interpreter for batch local reads/filtering/joins. Use tools.call(toolId,args) -> full ToolResult and tools.workflow(recipeArgs); return a JSON value with original evidence IDs/versions/quotes. Describe needed leaf schemas first. No await, imports, network, files, shell, clocks, randomness or writes. At most 16 local reads. Allowed tools (still subject to mode/scope): ${[...HYBRID_LEAVES].join(', ')}. Unknown/failed reads stop execution. Semantic uncertainty still needs normal planning. Code does not override user scope or tool permissions.`,
    execute: async (input, context) => executeHybridRead('interpreter', input, context, await dependencies(context)) }),
].map(tool => tool.id === 'workflow_read' ? tool : {...tool, version: '2', description: tool.description + interpreterHelp + PROGRAM_PROJECTION_HELP});
