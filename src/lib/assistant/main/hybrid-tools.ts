import { defineTool } from './tool-definition';
import { workflowInput, programInput, HYBRID_LEAVES, type HybridLeaf } from './hybrid-contracts';
import { executeHybridRead } from './hybrid-execution';
import type { ExecutionContext, ModelMessage } from './contracts';

async function dependencies(context: ExecutionContext) {
  const [{ dispatchTool }, { availableTools }, { assertCurrentKnowledgeMessages,KnowledgeSourceChangedError }, { assertCurrentMemoryMessages },{assertCurrentPrivateReplayMessages}] = await Promise.all([
    import('./executor'), import('./tools'), import('./knowledge-message-guard'), import('./memory-message-guard'),
    import('./private-replay-guard'),
  ]);
  return { dispatch: dispatchTool,
    allowed: new Set(availableTools(context).filter(t => HYBRID_LEAVES.has(t.id) && t.effect === 'read').map(t => t.id)),
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
  defineTool({ id: 'workflow_read', recovery: 'composite', input: workflowInput,
    description: 'Reviewed local read recipes: customer_recent resolves one unambiguous company, reads its first timeline page and up to 8 latest original mails; knowledge_evidence retrieves up to 8 evidence blocks. Reuse returned reads, disclose unread scope and continue with dynamic tools for unmet requirements. Never sends, syncs, merges or scores.',
    execute: async (input, context) => executeHybridRead('workflow', input, context, await dependencies(context)) }),
  defineTool({ id: 'programmatic_read', recovery: 'composite', input: programInput,
    description: `Run bounded synchronous JavaScript in an isolated QuickJS WASM interpreter for batch local reads/filtering/joins. Use tools.call(toolId,args) -> full ToolResult and tools.workflow(recipeArgs); return a JSON value with original evidence IDs/versions/quotes. Describe needed leaf schemas first. No await, imports, network, files, shell, clocks, randomness or writes. At most 16 local reads. Allowed tools (still subject to mode/scope): ${[...HYBRID_LEAVES].join(', ')}. Unknown/failed reads stop execution. Semantic uncertainty still needs normal planning. Code does not override user scope or tool permissions.`,
    execute: async (input, context) => executeHybridRead('interpreter', input, context, await dependencies(context)) }),
];
