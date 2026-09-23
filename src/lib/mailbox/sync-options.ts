import { z } from "zod";
export const DEFAULT_MAILBOX_LOOKBACK_DAYS=180;
export const MAX_MAILBOX_MESSAGES_PER_SYNC=100;
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
export const mailboxSyncSchema=z.object({connectionId:z.uuid(),lookbackDays:z.number().int().min(1).max(DEFAULT_MAILBOX_LOOKBACK_DAYS).optional(),maxMessages:z.number().int().min(1).max(MAX_MAILBOX_MESSAGES_PER_SYNC).optional(),
  folderScope:z.enum(["both","inbox","sent"]).default("both"),from:date.optional(),through:date.optional()}).strict()
  .refine(value=>!value.through||Boolean(value.from&&value.from<=value.through),{message:"日期范围无效"});
export function mailboxRange(options:{from?:string;through?:string;lookbackDays?:number},now=Date.now()){
  return {since:options.from?new Date(`${options.from}T00:00:00Z`):new Date(now-(options.lookbackDays??DEFAULT_MAILBOX_LOOKBACK_DAYS)*86400000),
    before:options.through?new Date(Date.parse(`${options.through}T00:00:00Z`)+86400000):undefined};
}
