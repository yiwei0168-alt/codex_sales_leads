import { requireApiSession } from "@/lib/auth/session";
import { researchAnswerInput } from "@/lib/leads/workflow/research-answer";
import { researchAnswerService, ResearchAnswerConflict } from "@/lib/leads/workflow/research-answer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request, params: Promise<{id:string}>, submit: boolean) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const {id} = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({error:"任务 ID 无效"},{status:400});
  let input;
  if (submit) {
    const text = await request.text();
    if (text.length > 4000) return Response.json({error:"补证内容过长"},{status:400});
    try { input = researchAnswerInput.parse(JSON.parse(text)); }
    catch { return Response.json({error:"补证内容无效"},{status:400}); }
  }
  try { return Response.json(await researchAnswerService(session.userId,id,input)); }
  catch (error) {
    if (error instanceof ResearchAnswerConflict) return Response.json({error:error.message},{status:409});
    throw error;
  }
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) { return handle(request,params,false); }
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) { return handle(request,params,true); }
