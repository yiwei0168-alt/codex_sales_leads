"use client";
import { useState } from "react";
import type { AgentApproval } from "@/lib/assistant/main/approvals";
export function AgentApprovals({ items }: { items: AgentApproval[] }) {
  const [error, setError] = useState("");
  async function decide(item: AgentApproval, decision: "approve" | "deny" | "revoke") {
    setError("");
    try { const r = await fetch(`/api/assistant/approvals/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, parameterHash: item.parameter_hash }) });
      if (!r.ok) throw new Error("确认内容或状态已变化，请刷新后核对");
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
  }
  return <>{items.filter(i => i.status === "pending" || i.status === "approved").map(item => <article key={item.id} className="agent-approval">
    <strong>确认操作 · {item.tool_id}</strong>
    <p className="text-sm">以下是本次实际执行内容。内容发生变化后，需要重新确认。</p>
    <pre>{JSON.stringify(item.payload, null, 2)}</pre>
    <div className="agent-run-actions">{item.status === "pending" && <><button type="button" onClick={() => void decide(item, "approve")}>确认此内容</button><button type="button" onClick={() => void decide(item, "deny")}>拒绝</button></>}
      <button type="button" onClick={() => void decide(item, "revoke")}>撤销</button></div>
  </article>)}{error && <p role="alert">{error}</p>}</>;
}
