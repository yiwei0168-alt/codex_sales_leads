import {useState} from "react";
import {createRoot} from "react-dom/client";
import {AgentAttachments} from "../../src/components/agent-attachments";
function Fixture(){const [selected,setSelected]=useState<string[]>([]);return <AgentAttachments selected={selected} onChange={setSelected}/>;}
createRoot(document.getElementById("root")!).render(<Fixture/>);
