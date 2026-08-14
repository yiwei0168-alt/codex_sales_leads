import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  return Response.json({ authenticated: Boolean(session), user: session ? { displayName: session.displayName } : null });
}
