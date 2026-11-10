import { requireApiSession } from "@/lib/auth/session";
import { addManualCompany, manualCompanySchema } from "@/lib/sales/manual-company";
import {companyListInput,listOwnedSalesCompanies} from '@/lib/sales/company-list';

/** Authenticated citation target; same scope and pagination as company_list. */
export async function GET(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const query=new URL(request.url).searchParams;
 if([...query.keys()].some(key=>query.getAll(key).length!==1))return Response.json({error:'重复查询参数'},{status:400});
 const raw=Object.fromEntries(query),input=companyListInput.safeParse({...raw,...('offset' in raw?{offset:Number(raw.offset)}:{})});
 if(!input.success)return Response.json({error:'列表范围或分页参数无效'},{status:400});
 return Response.json(await listOwnedSalesCompanies(session.userId,input.data),{headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(request:Request) {
  const session=await requireApiSession();if(session instanceof Response)return session;
  const input=manualCompanySchema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return Response.json({error:"请填写公司名称和有效国家"},{status:400});
  try {return Response.json(await addManualCompany(session.userId,input.data));}
  catch {return Response.json({error:"添加失败，请检查官网地址或稍后重试"},{status:400});}
}
