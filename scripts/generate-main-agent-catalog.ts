import { readFile, writeFile } from "node:fs/promises";
import { productTools, describeTool } from "../src/lib/assistant/main/tools";
const path = "docs/MAIN_AGENT_TOOL_CATALOG.md";
const ids = new Set<string>();
const rows = productTools.map(tool => {
  if (ids.has(tool.id)) throw new Error(`Duplicate tool ${tool.id}`);
  ids.add(tool.id); describeTool(tool); // Every advertised schema must serialize successfully.
  return `| ${tool.id} | ${tool.version} | ${tool.role} | ${tool.effect} | ${tool.cost} | ${tool.description.replace(/\|/g, "\\|")} |`;
});
const output = `# Registered main Agent tools\n\nGenerated from the executable registry. Run \`node scripts/run-tsx.cjs scripts/generate-main-agent-catalog.ts --check\` to detect drift. These ${rows.length} tools are implemented adapters; registration is not real-provider acceptance. The complete migration inventory remains in [MAIN_AGENT_CAPABILITIES.md](MAIN_AGENT_CAPABILITIES.md).\n\n| Tool | Version | Role | Effect | Cost | Purpose |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n`;
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== output) throw new Error("Tool catalog differs from registry");
} else await writeFile(path, output, "utf8");
console.log(JSON.stringify({ registered: rows.length, schemas: "valid", catalog: "consistent" }));
