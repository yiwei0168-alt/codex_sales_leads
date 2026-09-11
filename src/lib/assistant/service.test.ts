import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({get:vi.fn(),append:vi.fn(),create:vi.fn(),cancel:vi.fn(),run:vi.fn(),find:vi.fn()}));
vi.mock("./repository",()=>({getConversation:m.get,appendMessage:m.append,createConversation:vi.fn(),updateConversation:vi.fn(),createLeadSearchAction:m.create,cancelProposedLeadSearchActions:m.cancel}));
vi.mock("./graph",()=>({runAssistantWorkflow:m.run}));
vi.mock("./product-actions",()=>({measuredProductActionCompanies:m.find}));
import {processAssistantMessage} from "./service";
it("persists only a reviewable budget proposal, leaving existing search actions untouched",async()=>{
  m.get.mockResolvedValue({id:"conversation",title:"Existing",messages:[],actions:[]});
  m.run.mockResolvedValue({intent:"budget-change",reply:"review",warnings:[],intentPlan:{budgetProposal:{scope:"task",limitUsd:"20"},confidence:0.9,plannerModel:"kimi",plannerSource:"kimi-light"}});
  await processAssistantMessage("owner",{conversationId:"conversation",content:"任务预算20美元"});
  expect(m.append.mock.calls[1][2]).toMatchObject({intent:"budget-change",metadata:{budgetProposal:{scope:"task",limitUsd:"20"}}});
  expect(m.create).not.toHaveBeenCalled();expect(m.cancel).not.toHaveBeenCalled();expect(m.find).not.toHaveBeenCalled();
});
