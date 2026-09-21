import { notFound } from "next/navigation";
import { CopilotDemo } from "@/components/copilot-demo";
import { LoginScreen } from "@/components/login-screen";
import { getSession } from "@/lib/auth/session";
import { hasConfiguredUsers } from "@/lib/auth/users";
import { getCurrentWorkspace } from "@/lib/sales/repository";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params, searchParams }: {
  params: Promise<{ country: string; section: string }>; searchParams: Promise<{company?:string}>;
}) {
  const { country, section } = await params;
  if (!["overview", "leads", "channel-map", "opportunities"].includes(section)) notFound();
  const query = await searchParams;
  const session = await getSession();
  if (!session) return <LoginScreen configured={await hasConfiguredUsers()} />;
  const workspace = await getCurrentWorkspace(session.userId);
  return <CopilotDemo key={`${country}:${section}`} initialWorkspace={workspace ?? undefined}
    userName={session.displayName} initialCountry={country} initialCompanyId={query.company}
    initialView={section === "overview" ? "overview" : section === "leads" ? "results" : section === "opportunities" ? "opportunities" : "map"} />;
}
