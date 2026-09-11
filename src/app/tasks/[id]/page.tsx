import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getAssistantAction } from "@/lib/assistant/repository";
import { SearchTaskDetail } from "@/components/search-task-detail";
export const dynamic="force-dynamic";
export default async function TaskPage({params}:{params:Promise<{id:string}>}) {
  const session=await getSession();if(!session)redirect("/");
  const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
  const action=await getAssistantAction(session.userId,id);if(!action)notFound();
  return <main><Link href="/">返回产品</Link><SearchTaskDetail action={action}/><p>详情为打开时快照；刷新页面查看最新状态。</p></main>;
}
