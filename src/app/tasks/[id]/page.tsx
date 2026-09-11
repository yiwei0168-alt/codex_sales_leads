import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { TaskDetailView } from "@/components/task-detail-view";
export const dynamic="force-dynamic";
export default async function TaskPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{kind?:string}>}) {
  const session=await getSession();if(!session)redirect("/");
  const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
  const kind=(await searchParams).kind??"search";if(!["search","contacts","draft","send"].includes(kind))notFound();
  return <main><Link href="/">返回产品</Link><TaskDetailView id={id} kind={kind}/></main>;
}
