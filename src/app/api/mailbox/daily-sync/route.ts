import {requireApiSession} from '@/lib/auth/session';
import {readDailySync,setDailySync} from '@/lib/mailbox/daily-sync';
import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){const session=await requireApiSession();if(session instanceof Response)return session;return Response.json({schedules:await readDailySync(session.userId)});}
export async function POST(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const parsed=z.object({connectionId:z.uuid(),enabled:z.boolean()}).strict().safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'无效的自动同步设置'},{status:400});
 try{return Response.json(await setDailySync(session.userId,parsed.data.connectionId,parsed.data.enabled));}
 catch{return Response.json({error:'自动同步设置未保存，请检查邮箱连接并重试'},{status:409});}
}
