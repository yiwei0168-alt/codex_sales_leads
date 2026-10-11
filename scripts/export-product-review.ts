import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildMainAgentGraph } from '../src/lib/assistant/main/graph';
import { mainAgentWorkflowGraph } from '../src/lib/assistant/main/server';
import { leadBusinessTopologyGraph } from '../src/lib/leads/workflow/graph';
import { knowledgeBusinessGraph } from '../src/lib/knowledge/graph';
import { buildDevelopmentStrategyGraph } from '../src/lib/outreach/graph';
import { productTools, describeTool } from '../src/lib/assistant/main/tools';
import { modeAllowsTool } from '../src/lib/assistant/main/mode-tools';
import { modeModelConfig } from '../src/lib/assistant/main/mode-config';

// Topology export only: never invoke a graph, tool, database or model.
const unavailable = async (): Promise<never> => { throw new Error('Export must not execute nodes'); };
const root = 'docs/product-review-2026-10-11';
await mkdir(root, { recursive: true });
const graphs = {
  main_agent_server: mainAgentWorkflowGraph,
  main_agent_loop: buildMainAgentGraph({ boundary: unavailable, model: unavailable, tool: unavailable }),
  lead_business: leadBusinessTopologyGraph,
  knowledge_business: knowledgeBusinessGraph,
  outreach_business: buildDevelopmentStrategyGraph(),
};
const manifest: Record<string, unknown> = {
  capturedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Working-tree graph factories exported through LangGraph getGraphAsync/drawMermaid; not a running-service execution trace.',
  graphExecutions: 0, modelCalls: 0,
};
if (process.argv.includes('--live')) {
  for (const name of ['main_agent_workflow', 'lead_workflow', 'knowledge_workflow']) {
    const url = `http://127.0.0.1:2024/assistants/${name}/graph?xray=1`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error(`Live topology HTTP ${response.status}`);
    const graph = await response.json() as {nodes: Array<{id: string}>, edges: Array<{source: string;target: string;conditional?: boolean}>};
    const ids = new Map(graph.nodes.map((n, i) => [n.id, `n${i}`]));
    const lines = ['flowchart TD', ...graph.nodes.map(n => `  ${ids.get(n.id)}["${n.id.replaceAll('"', '&quot;')}"]`),
      ...graph.edges.map(e => `  ${ids.get(e.source)} ${e.conditional ? '-.->' : '-->'} ${ids.get(e.target)}`)];
    const raw = JSON.stringify(graph, null, 2);
    await writeFile(`${root}/live-${name}.json`, raw);
    await writeFile(`${root}/live-${name}.mmd`, lines.join('\n'));
    manifest[`live-${name}`] = { url, capturedAt: new Date().toISOString(), sha256: createHash('sha256').update(raw).digest('hex'), nodes: graph.nodes.length, edges: graph.edges.length };
  }
}
for (const [name, compiled] of Object.entries(graphs)) {
  const graph = await compiled.getGraphAsync();
  const mermaid = graph.drawMermaid();
  const topology = { nodes: Object.keys(graph.nodes), edges: graph.edges.map(e => ({ source: e.source, target: e.target, conditional: e.conditional ?? false, data: e.data ?? null })) };
  await writeFile(`${root}/${name}.mmd`, mermaid);
  await writeFile(`${root}/${name}.json`, JSON.stringify(topology, null, 2));
  manifest[name] = { ...topology, mermaidSha256: createHash('sha256').update(mermaid).digest('hex') };
}
const tools = productTools.map(tool => ({ ...describeTool(tool), modes: Object.fromEntries((['quick', 'standard', 'deep'] as const).map(mode => [mode, modeAllowsTool(mode, tool.id)])) }));
await writeFile(`${root}/tools.json`, JSON.stringify({ note: 'Mode allowance is not authorization; account, role, scope, feature flag, approval and connection gates still apply.', tools }, null, 2));
await writeFile(`${root}/modes.json`, JSON.stringify(Object.fromEntries((['quick', 'standard', 'deep'] as const).map(mode => [mode, modeModelConfig(mode)])), null, 2));
await writeFile(`${root}/export-manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ root, graphs: Object.keys(graphs), tools: tools.length, executions: 0 }));
