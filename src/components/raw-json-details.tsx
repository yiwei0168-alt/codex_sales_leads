"use client";

import { useState } from "react";

export function RawJsonDetails({ summary, value }: { summary: string; value: unknown }) {
  const [copyState, setCopyState] = useState("");
  const raw = JSON.stringify(value, null, 2) ?? "null";
  async function copy() {
    try {
      await navigator.clipboard.writeText(raw);
      setCopyState("已复制原始 JSON");
    } catch {
      setCopyState("复制失败，请手动选择下方内容");
    }
  }
  return <details className="raw-json-details">
    <summary>{summary}</summary>
    <button type="button" onClick={() => void copy()}>复制 JSON</button>
    {copyState && <small role="status">{copyState}</small>}
    <pre>{raw}</pre>
  </details>;
}
