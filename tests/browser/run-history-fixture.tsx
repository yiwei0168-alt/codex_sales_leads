import {useCallback,useState} from "react";
import {createRoot} from "react-dom/client";
import {AgentRunCard,useAgentRuns} from "../../src/components/agent-runs";
function Fixture(){const [revision,setRevision]=useState(0);const updated=useCallback(()=>{void revision;},[revision]);const data=useAgentRuns('conversation',updated);
return <main><button onClick={()=>setRevision(value=>value+1)}>重新建立轮询</button>{data.error&&<p role="alert">{data.error}</p>}{data.runs.map(run=><AgentRunCard key={run.id} run={run} events={data.eventsByRun[run.id]} now={data.now} onControl={data.control} onUndo={data.undo}/>)}</main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
