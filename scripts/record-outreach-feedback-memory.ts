import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

import { storeFeedbackMemory } from "../src/lib/outreach/knowledge-repository";
import { getPool } from "../src/lib/rag/db";
import { resolveTargetWorkspace } from "./resolve-target-workspace";

nextEnv.loadEnvConfig(process.cwd());

const value = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3).trim();
const summary = value("summary");
if (!summary || summary.length < 10 || summary.length > 1_000) throw new Error("--summary must contain 10-1000 characters");
const marketCodes = value("markets")?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
const channelRoles = value("roles")?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
const reason = value("reason") || "Reusable user-confirmed outreach strategy preference";
const workspace = await resolveTargetWorkspace();

try {
  const id = await storeFeedbackMemory(workspace.ownerId, {
    feedbackId: randomUUID(), summary, marketCodes, channelRoles, reason,
  });
  console.log(JSON.stringify({ id, stored: true, summary, marketCodes, channelRoles }, null, 2));
} finally {
  await getPool().end();
}
