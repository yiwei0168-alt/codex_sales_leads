import { createRoot } from "react-dom/client";
import { KnowledgeBase } from "../../src/components/knowledge-base";

createRoot(document.getElementById("root")!).render(<div className="conversation-theme"><div className="app-shell sidebar-collapsed"><main className="main-shell"><div className="workspace-content"><section className="workspace-heading"><h1>知识库</h1></section><KnowledgeBase initialTab="materials"/></div></main></div></div>);
