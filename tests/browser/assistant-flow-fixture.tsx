import { createRoot } from "react-dom/client";
import { AssistantHome } from "../../src/components/assistant-home";

createRoot(document.getElementById("root")!).render(<AssistantHome
  userName="测试用户"
  initialConversationId="11111111-1111-4111-8111-111111111111"
  onConversationChange={() => {}}
  onOpenResults={() => {}}
  onOpenCompany={() => {}}
/>);
