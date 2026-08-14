import { CopilotDemo } from "@/components/copilot-demo";
import { LoginScreen } from "@/components/login-screen";
import { getSession } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { getCurrentWorkspace } from "@/lib/sales/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) return <LoginScreen configured={isAuthConfigured()} />;
  const workspace = await getCurrentWorkspace();
  return <CopilotDemo initialWorkspace={workspace ?? undefined} userName={session.displayName} />;
}
