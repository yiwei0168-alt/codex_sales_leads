import { beforeEach,expect,it,vi } from "vitest";
const deps=vi.hoisted(()=>({approval:vi.fn(),execute:vi.fn()}));
vi.mock("./approvals",()=>({requestApproval:deps.approval}));
vi.mock("./tool-execution",()=>({executeRegisteredTool:deps.execute}));
import { executeMailBatch,mailBatchSchema } from "./mail-tools";
import { result } from "./contracts";
const context={userId:"user",runId:"run",leaseToken:"lease",role:"member" as const};
const item={itemId:"one",connectionId:"11111111-1111-4111-8111-111111111111",to:"one@example.invalid",subject:"Reviewed",body:"Final body"};
beforeEach(()=>{vi.clearAllMocks();deps.execute.mockResolvedValue(result({sent:true}));});
it("prepares every exact item without sending while any approval is pending",async()=>{
  deps.approval.mockResolvedValueOnce({id:"a",status:"approved"}).mockResolvedValueOnce({id:"b",status:"pending"});
  expect(await executeMailBatch({batchId:"batch",items:[item,{...item,itemId:"two",to:"two@example.invalid"}]},context)).toMatchObject({status:"waiting_approval"});
  expect(deps.approval).toHaveBeenCalledTimes(2);expect(deps.execute).not.toHaveBeenCalled();
});
it("routes every approved item through the same leaf execution boundary",async()=>{
  deps.approval.mockResolvedValue({id:"a",status:"approved"});
  const input={batchId:"batch",items:[item,{...item,itemId:"two",to:"two@example.invalid",attachments:[{assetId:item.connectionId,sha256:"a".repeat(64),filename:"offer.pdf"}]}]};
  expect(await executeMailBatch(input,context)).toMatchObject({status:"success",data:{sent:2,total:2}});
  expect(deps.execute.mock.calls[1][1]).toMatchObject({to:"two@example.invalid",attachments:[{assetId:item.connectionId,sha256:"a".repeat(64),filename:"offer.pdf"}]});
  expect(deps.execute.mock.calls[1][1]).not.toHaveProperty("itemId");
  expect(deps.execute.mock.calls.every(c=>c[0].id==="mail_send")).toBe(true);
});
it("keeps unknown delivery partial and does not retry it",async()=>{
  deps.approval.mockResolvedValue({id:"a",status:"consumed"});deps.execute.mockResolvedValue(result(null,{status:"unknown"}));
  expect(await executeMailBatch({batchId:"batch",items:[item]},context)).toMatchObject({status:"partial",data:{sent:0,total:1}});
  expect(deps.execute).toHaveBeenCalledOnce();
});
it("rejects duplicate items and forged approval fields",()=>{
  expect(mailBatchSchema.safeParse({batchId:"batch",items:[item,item]}).success).toBe(false);
  expect(mailBatchSchema.safeParse({batchId:"batch",items:[{...item,confirmed:true}]}).success).toBe(false);
});
