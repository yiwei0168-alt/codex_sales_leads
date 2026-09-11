import { z } from "zod";
export const memoryEditorSchema=z.object({
  id:z.uuid(),mode:z.enum(["create","edit"]),expectedUpdatedAt:z.string().optional(),
  kind:z.enum(["email-style","user-approved-marketing-claim"]),
  title:z.string().trim().min(1).max(160),content:z.string().trim().min(2).max(1200),
  marketCodes:z.array(z.string().regex(/^[A-Z]{2}$/)).max(30),
  channelRoles:z.array(z.enum(["Distributor","VAD","VAR","Dealer","Reseller","Retailer","E-tailer","SI","Installer","MSP","ISP","Agent","Brand Owner"])).max(20),
  externalUseApproved:z.boolean(),confirmed:z.literal(true),
}).strict().refine(value=>value.mode!=="edit"||Boolean(value.expectedUpdatedAt),{message:"编辑需提供原版本"});
export type MemoryEditorInput=z.infer<typeof memoryEditorSchema>;
