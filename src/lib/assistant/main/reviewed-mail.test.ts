import {beforeEach,expect,it,vi} from "vitest";
const deps=vi.hoisted(()=>({enqueue:vi.fn(),query:vi.fn(),request:vi.fn(),decide:vi.fn(),attachments:vi.fn()}));
vi.mock("./repository",()=>({enqueueRun:deps.enqueue}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:deps.query,tenantTransaction:vi.fn()}));
vi.mock("./approvals",()=>({requestApproval:deps.request,decideApproval:deps.decide}));
vi.mock("@/lib/mailbox/attachments",async original=>({...await original<typeof import("@/lib/mailbox/attachments")>(),loadMailAttachments:deps.attachments}));
import {queueReviewedMail} from "./reviewed-mail";
const input={connectionId:"11111111-1111-4111-8111-111111111111",to:"recipient@example.invalid",subject:"Reviewed",body:"Final content",idempotencyKey:"22222222-2222-4222-8222-222222222222",confirmed:true as const};
beforeEach(()=>{vi.clearAllMocks();deps.query.mockResolvedValue([{id:input.connectionId}]);deps.attachments.mockResolvedValue([]);deps.enqueue.mockResolvedValue({id:"run",status:"paused"});deps.request.mockResolvedValue({id:"approval",parameter_hash:"bound",status:"pending"});deps.decide.mockResolvedValue(true);});
it("queues an exact human-reviewed action only after persistent approval",async()=>{
  expect(await queueReviewedMail("user","member",input)).toEqual({status:"queued",runId:"run"});
  expect(deps.enqueue.mock.calls[0][3]).toMatchObject({kind:"mail",paused:true,spec:{items:[{to:input.to,body:input.body,itemId:"mail"}]}});
  expect(deps.decide).toHaveBeenCalledWith("user","approval","bound","approve");
  expect(deps.query.mock.invocationCallOrder.at(-1)).toBeGreaterThan(deps.decide.mock.invocationCallOrder[0]);
});
it("does not enqueue without a verified owned sender or exact confirmation",async()=>{
  deps.query.mockResolvedValue([]);await expect(queueReviewedMail("user","member",input)).rejects.toThrow("Verified owned sender");
  expect(deps.enqueue).not.toHaveBeenCalled();
  await expect(queueReviewedMail("user","member",{...input,confirmed:false} as never)).rejects.toThrow();
});
it("does not release a paused task if its approval changes",async()=>{
  deps.decide.mockResolvedValue(false);await expect(queueReviewedMail("user","member",input)).rejects.toThrow("Approval changed");
  expect(deps.query).toHaveBeenCalledTimes(1);
});
