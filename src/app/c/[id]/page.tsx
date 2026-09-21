import { notFound } from "next/navigation";
import { z } from "zod";
import { CopilotDemo } from "@/components/copilot-demo";
import { LoginScreen } from "@/components/login-screen";
import { getSession } from "@/lib/auth/session";
import { hasConfiguredUsers } from "@/lib/auth/users";
import { getConversation } from "@/lib/assistant/repository";
import { getCurrentWorkspace } from "@/lib/sales/repository";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await getSession();
  if (!session) return <LoginScreen configured={await hasConfiguredUsers()} />;
  const conversation = await getConversation(session.userId, id);
  if (!conversation || conversation.status !== "active") notFound();
  const workspace = await getCurrentWorkspace(session.userId);
  return <CopilotDemo key={id} initialConversationId={id} initialWorkspace={workspace ?? undefined} userName={session.displayName} />;
}
