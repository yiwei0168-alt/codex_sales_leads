import { CopilotDemo } from "@/components/copilot-demo";
import { LoginScreen } from "@/components/login-screen";
import { getSession } from "@/lib/auth/session";
import { hasConfiguredUsers } from "@/lib/auth/users";
import { getCurrentWorkspace } from "@/lib/sales/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) return <LoginScreen configured={await hasConfiguredUsers()} />;
  const workspace = await getCurrentWorkspace(session.userId);
  return <CopilotDemo initialWorkspace={workspace ?? undefined} userName={session.displayName} />;
}
