"use client";

import { useEffect, useRef, useState } from "react";
import { WorkspaceDialog } from "./workspace-dialog";

/** A failed acknowledgement is not proof that a rename did not commit. */
export function ConversationRenameDialog({ id, initialTitle, onClose, onSaved, onObserved }: {
  id: string; initialTitle: string; onClose: () => void; onSaved: (title: string, reconciled: boolean) => void; onObserved: (title: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const lock = useRef(false);
  const attempted = useRef("");
  const alive = useRef(true);
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; request.current?.abort(); };
  }, []);

  async function submit(check: boolean) {
    if (lock.current || unavailable || (!check && needsCheck)) return;
    const normalized = title.trim();
    if (!check && (!normalized || normalized.length > 120)) {
      setError("请输入 1–120 个字符的对话名称。"); return;
    }
    lock.current = true; setBusy(true); setError("");
    if (!check) attempted.current = normalized;
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`/api/assistant/conversations/${id}`, {
        method: check ? "GET" : "PATCH", cache: "no-store", signal: controller.signal,
        ...(!check ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: normalized }) } : {}),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!alive.current) return;
      if (check) {
        if (response.status === 404) {
          setUnavailable(true); setError("该对话当前不可用，请关闭窗口并刷新历史核对。"); return;
        }
        const current = body && typeof body === "object" && "conversation" in body ? body.conversation : null;
        if (!response.ok || !current || typeof current !== "object" || !("title" in current) || typeof current.title !== "string") {
          throw Error("readback-failed");
        }
        onObserved(current.title);
        if (current.title === attempted.current && normalized === attempted.current) { onSaved(current.title, true); return; }
        setNeedsCheck(false); setOverwrite(true);
        setError(current.title === attempted.current
          ? "已核对上次提交的名称。你后来修改的输入尚未保存，已为你保留；如需覆盖，请再次保存。"
          : `当前服务器名称为“${current.title}”，与刚才提交的名称不同。输入已保留；如需覆盖，请再次保存。`);
      } else if (response.ok && body && typeof body === "object" && "updated" in body && body.updated === true) {
        onSaved(normalized, false);
      } else if ([400, 401, 403, 404, 409].includes(response.status)) {
        setUnavailable([401, 403, 404].includes(response.status));
        setError(response.status === 400 ? "名称未被接受，请检查后再保存。" : "本次重命名未被接受，请核对账号和对话是否仍可用。");
      } else {
        throw Error("acknowledgement-unknown");
      }
    } catch {
      if (!alive.current) return;
      setNeedsCheck(true);
      setError(check ? "暂时无法读取当前名称。输入已保留，请稍后再次核对。" : "未收到保存确认，名称可能已经保存。输入已保留，请先核对保存结果。");
    } finally {
      clearTimeout(timeout); lock.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <WorkspaceDialog title="重命名对话" busy={busy} focusCloseButton={false} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); void submit(false); }}>
      <label>对话名称<input data-dialog-initial-focus value={title} disabled={busy} maxLength={120} onChange={event => setTitle(event.target.value)} /></label>
      {error && <p className="workspace-error" role="alert">{error}</p>}
      <footer className="workspace-dialog-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>取消</button>
        {needsCheck && !unavailable && <button type="button" className="secondary-button" disabled={busy} onClick={() => void submit(true)}>{busy ? "正在核对…" : "核对保存结果"}</button>}
        <button type="submit" className="primary-button" disabled={busy || needsCheck || unavailable || !title.trim()}>{busy ? "请稍候…" : overwrite ? "仍要保存此名称" : "保存名称"}</button>
      </footer>
    </form>
  </WorkspaceDialog>;
}
