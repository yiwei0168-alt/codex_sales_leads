import { createRoot } from "react-dom/client";
import { useState } from "react";
import { CompanyDetail } from "../../src/components/company-detail";
import { TaskDetailView } from "../../src/components/task-detail-view";
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
function Fixture() {
  const [open,setOpen]=useState(""); const [nested,setNested]=useState(false);
  return <><button onClick={()=>setOpen("company")}>打开公司</button><button onClick={()=>setOpen("task")}>打开任务</button>
    {open==="company"&&<CompanyDetail company={company} onClose={()=>setOpen("")} onUpdate={()=>{}} onEvidence={()=>setNested(true)} onOpenAssistant={()=>{}}/>}
    {open==="task"&&<TaskDetailView id="fixture-task" kind="generation" onClose={()=>setOpen("")}/>}
    {nested&&<Nested close={()=>setNested(false)}/>}</>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
