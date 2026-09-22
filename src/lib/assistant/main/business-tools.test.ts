import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/knowledge/review-repository",()=>({listGoldReviews:vi.fn(),saveGoldReview:vi.fn(),unlockGoldHoldout:vi.fn()}));
import { businessTools } from "./business-tools";
import { needsApproval } from "./approvals";

const byId = new Map(businessTools.map(tool => [tool.id, tool]));

describe("existing page workflow tool contracts", () => {
  it("runs ordinary public searches without an action approval", () => {
    for (const id of ["web_search", "search_channel"]) {
      expect(byId.get(id)?.effect).toBe("read");
      expect(needsApproval(byId.get(id)!)).toBe(false);
    }
    expect(needsApproval(byId.get("lead_workflow")!)).toBe(true);
    expect(needsApproval(byId.get("company_score_publish")!)).toBe(true);
  });
  it("keeps locally simulated publication flows behind exact approval inputs", () => {
    for (const id of ["company_score_publish","contacts_verify_evaluate","contacts_verify_publish","knowledge_shared_binary_register","knowledge_shared_release_activate"]) {
      expect(byId.get(id)?.effect).toBe("publish");
    }
    for (const id of ["knowledge_shared_binary_register","knowledge_shared_release_gate","knowledge_shared_release_activate"]) {
      expect(byId.get(id)?.role).toBe("admin");
    }
    expect(byId.get("knowledge_shared_release_activate")!.input.safeParse({releaseKey:"fixture",releaseId:"00000000-0000-4000-8000-000000000001",expectedManifestHash:"a".repeat(64)}).success).toBe(true);
    expect(byId.get("knowledge_shared_release_activate")!.input.safeParse({releaseKey:"fixture",releaseId:"00000000-0000-4000-8000-000000000001"}).success).toBe(false);
    expect(byId.get("contacts_verify_publish")!.input.safeParse({decisionId:"00000000-0000-4000-8000-000000000001",email:"fixture@example.com",category:"Official",activeStatus:"Verified",expectedCurrentDecisionId:null}).success).toBe(false);
    expect(byId.get("follow_up_generate")?.effect).toBe("reversible");
  });
  it("registers new shared-service adapters with the required approval classes", () => {
    expect(byId.has("workspace_mode_update")).toBe(false);
    expect(byId.get("development_feedback_generate")?.effect).toBe("reversible");
    expect(byId.get("mailbox_learning_review")?.effect).toBe("publish");
    expect(byId.get("mail_message_company_update")?.effect).toBe("publish");
    expect(byId.get("mail_message_delete")?.effect).toBe("destructive");
    expect(byId.get("mail_connection_control")?.effect).toBe("destructive");
    expect(byId.get("task_reconcile")?.recovery).toBe("reconcile");
    expect(byId.get("knowledge_gold_review_save")?.role).toBe("admin");
    expect(byId.get("knowledge_gold_holdout_unlock")?.role).toBe("admin");
    expect(byId.get("knowledge_shared_text_upsert")?.role).toBe("admin");
    expect(byId.get("knowledge_shared_text_upsert")?.effect).toBe("publish");
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
