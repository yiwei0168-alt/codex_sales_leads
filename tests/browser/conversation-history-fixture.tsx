import { createRoot } from "react-dom/client";
import { ConversationHistory } from "../../src/components/conversation-history";

createRoot(document.getElementById("root")!).render(<aside className="sidebar mobile-open" style={{width:248,height:"100vh",padding:12}}>
  <ConversationHistory activeId="11111111-1111-4111-8111-111111111111" refreshKey={0} onSelect={() => {}} onNew={() => {}} />
</aside>);
