import { query,tenantQuery } from "../src/lib/rag/db";

export async function resolveTargetWorkspace(args = process.argv): Promise<{ id: string; email: string; ownerId: string }> {
  const requestedUserEmail = args.find((value) => value.startsWith("--user-email="))?.slice("--user-email=".length).trim().toLowerCase()
    || process.env.APP_USER_EMAIL?.trim().toLowerCase();
  const users = await query<{id:string;email:string}>(
    `select id,email from app_user where status='active' ${requestedUserEmail?"and lower(email)=$1":""}
     order by created_at`,requestedUserEmail?[requestedUserEmail]:[]);
  const rows:{id:string;email:string;ownerId:string}[]=[];
  for(const user of users){
    const workspaces=await tenantQuery<{id:string}>(user.id,
      "select id from market_workspace where owner_id=$1 and slug='global-sales' and status='active'",[user.id]);
    for(const workspace of workspaces)rows.push({id:workspace.id,email:user.email,ownerId:user.id});
    if(rows.length>1)break;
  }
  if (rows.length === 0) throw new Error(requestedUserEmail
    ? `No active global-sales workspace found for ${requestedUserEmail}`
    : "No active global-sales workspace found");
  if (rows.length > 1) throw new Error("Multiple active workspaces found; pass --user-email=<login email>");
  return rows[0];
}
