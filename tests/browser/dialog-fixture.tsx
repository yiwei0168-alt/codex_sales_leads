import { createRoot } from "react-dom/client";
import { useState } from "react";
import { CompanyDetail } from "../../src/components/company-detail";
import { TaskDetailView } from "../../src/components/task-detail-view";
import { SpendBudget } from "../../src/components/spend-budget";
import {TaskSpendBudget} from "../../src/components/task-spend-budget";
import {BudgetProposalCard} from "../../src/components/budget-proposal";
import { OutboundComposer } from "../../src/components/outbound-composer";
import { SearchContinuation } from "../../src/components/search-continuation";
import { useDialogFocus } from "../../src/components/use-dialog-focus";
import type { CompanyRecord } from "../../src/lib/domain";

const company = {
  id: "fixture-company", displayName: "Fixture Networks", country: "Mexico", city: "Test City",
  domain: "example.test", summary: "Synthetic browser fixture", roles: ["Retailer"],
  primaryBusinessRole: "Retailer", accountTier: "B", supplyModel: "Unknown",
  fitScore: 75, opportunityStage: "Discovered", risks: [], unknowns: [],
  evidence: [{ id: "fixture-evidence", claim: "Synthetic evidence", status: "Verified", capturedAt: "2026-09-01" }],
} as unknown as CompanyRecord;
function Nested({close}:{close:()=>void}) {
  const ref=useDialogFocus(close);
  return <div className="modal-backdrop"><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="nested"><button onClick={close}>关闭证据</button></section></div>;
}
function MobileNavigationFixture() {
  const [open,setOpen]=useState(false);
  const ref=useDialogFocus(open?()=>setOpen(false):undefined);
  return <>
    <button className="mobile-nav-trigger" aria-label="Open test navigation" aria-controls="test-navigation" aria-expanded={open} onClick={()=>setOpen(true)}><span/><span/><span/></button>
    {open&&<button className="mobile-nav-backdrop" aria-label="Close test navigation backdrop" onClick={()=>setOpen(false)}/>}
    <aside ref={ref} hidden={!open} style={{display:open?undefined:"none"}} id="test-navigation" tabIndex={open?-1:undefined} className={`sidebar test-navigation ${open?"mobile-open":""}`} role={open?"dialog":undefined} aria-modal={open?"true":undefined} aria-label={open?"Test navigation":undefined}>
      <button className="mobile-nav-close" aria-label="Close test navigation" onClick={()=>setOpen(false)}>×</button>
      <nav><button className="nav-item active">Current view</button><button className="nav-item">Second view</button></nav>
    </aside>
  </>;
}
function ResponsiveTableFixture() {
  return <section className="panel results-panel"><div className="table-scroll"><table className="data-table responsive-table">
    <thead><tr><th>Company</th><th>Role</th><th>Score</th></tr></thead>
    <tbody><tr><td data-label="Company">Fixture Networks</td><td data-label="Role">Distributor</td><td data-label="Score">88</td></tr></tbody>
  </table></div></section>;
}
function Fixture() {
  const [open,setOpen]=useState(""); const [nested,setNested]=useState(false);const [budget,setBudget]=useState(false);
  return <><MobileNavigationFixture/><ResponsiveTableFixture/><TaskSpendBudget actionId="fixture-action"/><button onClick={()=>setOpen("company")}>打开公司</button><button onClick={()=>setOpen("task")}>打开任务</button>
    {open==="company"&&<CompanyDetail company={company} onClose={()=>setOpen("")} onUpdate={()=>{}} onEvidence={()=>setNested(true)} onOpenAssistant={()=>{}}/>}
    {open==="task"&&<TaskDetailView id="fixture-task" kind="generation" onClose={()=>setOpen("")}/>}
    <button onClick={()=>setOpen('contact-task')}>打开异常联系人任务</button>{open==='contact-task'&&<TaskDetailView id="fixture-contact-task" kind="contacts" onClose={()=>setOpen('')}/>}
    {nested&&<Nested close={()=>setNested(false)}/>}<button onClick={()=>setBudget(true)}>打开预算</button>{budget&&<SpendBudget/>}
    <button onClick={()=>setOpen('budget-proposal')}>打开预算提案</button>{open==='budget-proposal'&&<BudgetProposalCard proposal={{scope:"task",limitUsd:"20"}} actions={[{id:"fixture-budget-task",actionType:"lead-search",status:"proposed",payload:{countryCode:"GB",countryName:"英国",roles:["SI"],targetCount:30,objective:"new-market",queryLanguage:"en",userRequest:"fixture"},result:{},createdAt:"",updatedAt:""}]}/>}
    <button onClick={()=>setOpen('mail')}>打开邮件</button>{open==='mail'&&<OutboundComposer companyId="fixture-country-company" draft="" onSent={()=>{}}/>}
    <button onClick={()=>setOpen('continuation')}>打开续搜</button>{open==='continuation'&&<SearchContinuation actionId="fixture-parent"/>}</>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
