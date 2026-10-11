import {useState} from "react";
import {createRoot} from "react-dom/client";
import {KnowledgeRevisions} from "../../src/components/knowledge-revisions";
function Fixture(){const [id,setId]=useState('first');return <main><button onClick={()=>setId('second')}>切换文档</button><KnowledgeRevisions documentId={id}/></main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
