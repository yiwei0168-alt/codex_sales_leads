import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const config = JSON.parse(await readFile(path.join(projectRoot, "langgraph.json"), "utf8"));
const loaded = [];

for (const [graphId, definition] of Object.entries(config.graphs ?? {})) {
  const spec = typeof definition === "string" ? definition : definition.path;
  const [relativeFile, exportName] = spec.split(":", 2);
  if (!relativeFile || !exportName) throw new Error(`Invalid graph definition for ${graphId}`);
  const sourceFile = path.resolve(projectRoot, relativeFile);
  await stat(sourceFile);
  const graphModule = await import(pathToFileURL(sourceFile).href);
  const graph = graphModule[exportName];
  if (!graph || typeof graph.invoke !== "function" || !graph.builder) {
    throw new Error(`Graph ${graphId} did not resolve to a compiled LangGraph export`);
  }
  loaded.push(graphId);
}

if (loaded.length === 0) throw new Error("No LangGraph exports configured");
console.log(JSON.stringify({ ok: true, graphs: loaded }));
