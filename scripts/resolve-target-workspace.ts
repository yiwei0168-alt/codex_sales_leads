import { query } from "../src/lib/rag/db";

export async function resolveTargetWorkspace(args = process.argv): Promise<{ id: string; email: string }> {
  const requestedUserEmail = args.find((value) => value.startsWith("--user-email="))?.slice("--user-email=".length).trim().toLowerCase()
    || process.env.APP_USER_EMAIL?.trim().toLowerCase();
  const rows = requestedUserEmail
    ? await query<{ id: string; email: string }>(
      `select w.id, u.email from market_workspace w join app_user u on u.id = w.owner_id
       where w.slug = 'global-sales' and w.status = 'active' and u.status = 'active' and lower(u.email) = $1`,
      [requestedUserEmail],
    )
    : await query<{ id: string; email: string }>(
      `select w.id, u.email from market_workspace w join app_user u on u.id = w.owner_id
       where w.slug = 'global-sales' and w.status = 'active' and u.status = 'active'
       order by u.created_at`,
    );
  if (rows.length === 0) throw new Error(requestedUserEmail
    ? `No active global-sales workspace found for ${requestedUserEmail}`
    : "No active global-sales workspace found");
  if (rows.length > 1) throw new Error("Multiple active workspaces found; pass --user-email=<login email>");
  return rows[0];
}
