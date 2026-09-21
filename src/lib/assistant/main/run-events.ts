export type RunEvent = { id: string; kind: string; payload: Record<string, unknown> };

/** Read one saved SSE cursor page. The server closes each page; callers resume at its last ID. */
export function parseRunEventPage(body: string): RunEvent[] {
  const events: RunEvent[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const id = lines.find(line => line.startsWith("id: "))?.slice(4);
    const kind = lines.find(line => line.startsWith("event: "))?.slice(7);
    const data = lines.find(line => line.startsWith("data: "))?.slice(6);
    if (!id || !/^\d{1,18}$/.test(id) || !kind || !data) continue;
    try {
      const payload = JSON.parse(data) as unknown;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) events.push({ id, kind, payload: payload as Record<string, unknown> });
    } catch { /* malformed event is not a receipt */ }
  }
  return events;
}
