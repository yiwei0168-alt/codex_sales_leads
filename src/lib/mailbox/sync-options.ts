import { z } from "zod";
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
export const mailboxSyncSchema=z.object({connectionId:z.uuid(),lookbackDays:z.number().int().min(1).max(3650).optional(),maxMessages:z.number().int().min(1).max(1000).optional(),
  folderScope:z.enum(["both","inbox","sent"]).default("both"),from:date.optional(),through:date.optional()}).strict()
  .refine(value=>!value.through||Boolean(value.from&&value.from<=value.through),{message:"日期范围无效"});
export function mailboxRange(options:{from?:string;through?:string;lookbackDays?:number},now=Date.now()){
  return {since:options.from?new Date(`${options.from}T00:00:00Z`):new Date(now-(options.lookbackDays??365)*86400000),
    before:options.through?new Date(Date.parse(`${options.through}T00:00:00Z`)+86400000):undefined};
}
