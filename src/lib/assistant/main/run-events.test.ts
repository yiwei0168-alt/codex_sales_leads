import { describe, expect, it } from "vitest";
import { mergeRunEvents, parseRunEventPage } from "./run-events";

describe("saved run event pages", () => {
  it("ignores retry/comments and keeps exact persisted IDs and payloads", () => {
    expect(parseRunEventPage('retry: 1500\n\nid: 12\nevent: tool_result\ndata: {"tool":"knowledge_search","status":"partial"}\n\n: cursor page complete\n\n'))
      .toEqual([{ id: "12", kind: "tool_result", payload: { tool: "knowledge_search", status: "partial" } }]);
  });
  it("never treats malformed data as an execution receipt", () => {
    expect(parseRunEventPage("id: 13\nevent: tool_result\ndata: oops\n\n")).toEqual([]);
  });
});

it("replayed event pages remain unique and sorted without losing large IDs",()=>{
 const event=(id:string)=>({id,kind:"status",payload:{status:"completed"}});
 const prior=[event("9007199254740993"),event("2")];
 expect(mergeRunEvents(prior,[event("2"),event("10"),event("9007199254740992")]).map(row=>row.id))
  .toEqual(["2","10","9007199254740992","9007199254740993"]);
 expect(prior).toHaveLength(2);
});
