import {z} from 'zod';
import {digest} from './contracts';
import {modelFunctions,transportMessages,modelReplySchema} from './model';
import {modelRequestManifestSchema,assertModelRequestManifest} from './model-request-manifest';

/** Evaluator preflight only. No inference of missing historical metadata, quality or source approval. */
export function auditModelProtocol(call:{input:unknown;input_hash:string;output:unknown}){
 try{
  if(digest(call.input)!==call.input_hash)return {bound:false,reason:'journal-input-changed'} as const;
  const outcome=z.object({status:z.string()}).passthrough().parse(call.output);
  if(outcome.status!=='success')return {bound:false,reason:'model-attempt-not-successful'} as const;
  const input=z.object({messages:z.array(modelReplySchema.extend({role:z.enum(['system','user','assistant','tool']),content:z.string().nullable(),tool_call_id:z.string().optional()})).min(1),
   index:z.number().int().min(0).max(2).optional(),profile:z.object({routes:z.array(z.object({model:z.string(),effort:z.string()}))}).optional(),
   config:z.object({model:z.string(),providers:z.array(z.string())}).optional()}).passthrough().parse(call.input);
  const output=z.object({status:z.literal('success'),data:z.record(z.string(),z.unknown())}).passthrough().parse(call.output);
  const value=input.profile?z.record(z.string(),z.unknown()).parse(output.data.value):output.data;
  if(!value.requestManifest)return {bound:false,reason:'historical-wire-manifest-missing'} as const;
  const m=modelRequestManifestSchema.parse(value.requestManifest);
  assertModelRequestManifest({...m.settings,messages:transportMessages(input.messages),tools:modelFunctions},m);
  const route=input.profile?.routes[input.index??-1];
  if(input.profile){
   if(!route||route.model!==m.requestedModel||m.settings.stream!==true||
    (m.settings.reasoning as {effort?:unknown}|undefined)?.effort!==route.effort)return {bound:false,reason:'route-config-mismatch'} as const;
  }else if(!input.config||input.config.model!==m.requestedModel||digest((m.settings.provider as {only?:unknown}|undefined)?.only)!==digest(input.config.providers))return {bound:false,reason:'route-config-mismatch'} as const;
  if(!m.response.modelMatchesRequested||!m.response.generationId||!m.response.provider)return {bound:false,reason:'provider-identity-incomplete'} as const;
  return {bound:true,protocol:m.protocol,requestHash:m.requestHash,messagesHash:m.messagesHash,toolSchemaHash:m.toolSchemaHash,
   settingsHash:m.settingsHash,model:m.requestedModel,provider:m.response.provider,generationId:m.response.generationId,qualityAccepted:false} as const;
 }catch{return {bound:false,reason:'invalid-or-stale-wire-manifest'} as const;}
}
