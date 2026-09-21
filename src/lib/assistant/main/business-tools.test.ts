import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/knowledge/review-repository",()=>({listGoldReviews:vi.fn(),saveGoldReview:vi.fn(),unlockGoldHoldout:vi.fn()}));
import { businessTools } from "./business-tools";

const byId = new Map(businessTools.map(tool => [tool.id, tool]));

describe("existing page workflow tool contracts", () => {
  it("registers new shared-service adapters with the required approval classes", () => {
    expect(byId.get("workspace_mode_update")?.effect).toBe("reversible");
    expect(byId.get("development_feedback_generate")?.effect).toBe("reversible");
    expect(byId.get("mailbox_learning_review")?.effect).toBe("publish");
    expect(byId.get("mail_message_company_update")?.effect).toBe("publish");
    expect(byId.get("mail_message_delete")?.effect).toBe("destructive");
    expect(byId.get("mail_connection_control")?.effect).toBe("destructive");
    expect(byId.get("task_reconcile")?.recovery).toBe("reconcile");
    expect(byId.get("knowledge_gold_review_save")?.role).toBe("admin");
    expect(byId.get("knowledge_gold_holdout_unlock")?.role).toBe("admin");
  });

  it("keeps credentials and model-supplied confirmation flags out of tool inputs", () => {
    const connection = byId.get("mail_connection_control")!;
    expect(connection.input.safeParse({connectionId:"00000000-0000-4000-8000-000000000001",action:"disconnect",deleteKnowledge:false}).success).toBe(true);
    expect(connection.input.safeParse({connectionId:"00000000-0000-4000-8000-000000000001",action:"delete",deleteKnowledge:true,password:"secret"}).success).toBe(false);
    expect(byId.get("knowledge_gold_holdout_unlock")!.input.safeParse({confirmed:true}).success).toBe(false);
  });

  it("requires observed revisions and bounded reviewed source coordinates", () => {
    expect(byId.get("development_feedback_generate")!.input.safeParse({draftId:"00000000-0000-4000-8000-000000000001",feedback:"revise",currentBody:"x".repeat(40),sourceRevision:0,allowMemory:false}).success).toBe(false);
    expect(byId.get("knowledge_gold_review_save")!.input.safeParse({caseId:"case-1",caseSha256:"a".repeat(64),expectedAnswer:"answer",expectedSources:[{assetSha256:"b".repeat(64),unitIndex:1}],reviewNote:""}).success).toBe(true);
  });
});
