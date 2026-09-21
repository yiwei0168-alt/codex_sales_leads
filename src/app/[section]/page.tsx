import { notFound } from "next/navigation";
import { CopilotDemo } from "@/components/copilot-demo";
import { LoginScreen } from "@/components/login-screen";
import { getSession } from "@/lib/auth/session";
import { hasConfiguredUsers } from "@/lib/auth/users";
import { getCurrentWorkspace } from "@/lib/sales/repository";
import type { AppView } from "@/lib/sales/app-navigation";

export const dynamic = "force-dynamic";
export default async function BusinessPage({ params, searchParams }: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ tab?: string; country?: string; company?: string }>;
}) {
  const { section } = await params;
  const query = await searchParams;
  if (!["development", "knowledge", "tasks", "settings", "help"].includes(section)) notFound();
  const session = await getSession();
  if (!session) return <LoginScreen configured={await hasConfiguredUsers()} />;
  const workspace = await getCurrentWorkspace(session.userId);
  const view: AppView = section === "development"
    ? query.tab === "letters" ? "assistant" : query.tab === "mailbox" ? "mailbox" : "opportunities"
    : section as AppView;
  return <CopilotDemo key={`${section}:${query.tab}:${query.country}:${query.company}`} initialView={view}
    initialCountry={query.country} initialCompanyId={query.company} initialTab={query.tab}
    initialWorkspace={workspace ?? undefined} userName={session.displayName} />;
}
