import { requireApiSession } from "@/lib/auth/session";
import {readTaskUsage} from "@/lib/assistant/task-usage";

/** Operational output efficiency and transport billing are distinct, overlapping ledgers. */
export async function GET(){
  const session=await requireApiSession();if(session instanceof Response)return session;
  try{
    return Response.json(await readTaskUsage(session.userId),{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"用量汇总读取失败，不能据此推断费用为零"},{status:503});}
}
