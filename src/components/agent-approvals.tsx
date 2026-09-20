"use client";
import { useEffect, useState } from "react";
import type { AgentApproval } from "@/lib/assistant/main/approvals";
export function AgentApprovals({ runId }: { runId: string }) {
  const [items, setItems] = useState<AgentApproval[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try { const r = await fetch(`/api/assistant/runs/${runId}/approvals`, { cache: "no-store" });
        if (r.ok) { const body = await r.json() as { approvals: AgentApproval[] }; if (!stopped) setItems(body.approvals); }
      } catch { /* retry through polling */ }
    };
    void load(); const timer = setInterval(() => void load(), 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [runId]);
  async function decide(item: AgentApproval, decision: "approve" | "deny" | "revoke") {
    setError("");
    try { const r = await fetch(`/api/assistant/approvals/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, parameterHash: item.parameter_hash }) });
      if (!r.ok) throw new Error("确认内容或状态已变化，请刷新后核对");
      setItems(items => items.filter(i => i.id !== item.id));
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
  }
  return <>{items.filter(i => i.status === "pending" || i.status === "approved").map(item => <article key={item.id} className="my-3 rounded-lg border border-amber-700 p-3">
    <strong>确认操作 · {item.tool_id}</strong>
    <p className="text-sm">以下是本次实际执行内容。内容发生变化后，需要重新确认。</p>
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify(item.payload, null, 2)}</pre>
    <div className="mt-3 flex gap-4">{item.status === "pending" && <><button type="button" onClick={() => void decide(item, "approve")}>确认此内容</button><button type="button" onClick={() => void decide(item, "deny")}>拒绝</button></>}
      <button type="button" onClick={() => void decide(item, "revoke")}>撤销</button></div>
  </article>)}{error && <p role="alert">{error}</p>}</>;
}
