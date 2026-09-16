import { readFile } from "node:fs/promises";
import path from "node:path";

import { startServer } from "@langchain/langgraph-api/server";

const projectRoot = process.cwd();
const config = JSON.parse(await readFile(path.join(projectRoot, "langgraph.json"), "utf8"));
const port = Number.parseInt(process.env.LANGGRAPH_PORT || "2024", 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("LANGGRAPH_PORT must be an integer between 1 and 65535");
}

const runtime = await startServer({
  port,
  host: "127.0.0.1",
  nWorkers: 10,
  cwd: projectRoot,
  graphs: config.graphs,
  http: config.http,
});

console.log(`LangGraph API ready at http://${runtime.host}`);

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`Stopping LangGraph API after ${signal}...`);
  await runtime.cleanup();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
