import { requireApiSession } from "@/lib/auth/session";
import {readSavedCompanyAssessment} from "@/lib/sales/company-detail-read";
export async function GET(_request:Request,{params}:{params:Promise<{externalId:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {externalId}=await params;if(externalId.length>180)return Response.json({error:"参数无效"},{status:400});
  return Response.json({assessment:await readSavedCompanyAssessment(session.userId,externalId)},{headers:{"Cache-Control":"private, no-store"}});
}
