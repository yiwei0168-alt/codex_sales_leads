import { createRoot } from "react-dom/client";
import { MailboxWorkspace } from "../../src/components/mailbox-workspace";

createRoot(document.getElementById("root")!).render(<div className="conversation-theme"><div className="app-shell sidebar-collapsed"><main className="main-shell"><div className="workspace-content"><section className="workspace-heading"><h1>客户开发 · 邮箱</h1></section><MailboxWorkspace/></div></main></div></div>);
