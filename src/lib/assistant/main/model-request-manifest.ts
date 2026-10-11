import {z} from 'zod';
import {digest} from './contracts';
import {matchesBatchModel} from '@/providers/openrouter-batch';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const modelRequestManifestSchema=z.object({protocol:z.literal('main-model-wire-v1'),
 requestHash:sha,messagesHash:sha,systemMessagesHash:sha,toolSchemaHash:sha,settingsHash:sha,
 settings:z.record(z.string(),z.unknown()),requestedModel:z.string(),
 response:z.object({model:z.string().nullable(),provider:z.string().nullable(),generationId:z.string().nullable(),modelMatchesRequested:z.boolean()}).strict(),
}).strict();
export type ModelRequestManifest=z.infer<typeof modelRequestManifestSchema>;

/** Hash the exact parsed wire body; authentication headers and private message text are never copied. */
export function modelRequestManifest(body:Record<string,unknown>,response:unknown):ModelRequestManifest{
 const {messages,tools,...settings}=body;
 if(typeof body.model!=='string'||!Array.isArray(messages)||!Array.isArray(tools))throw new Error('Model wire manifest input invalid');
 const result=response&&typeof response==='object'?response as Record<string,unknown>:{};
 return modelRequestManifestSchema.parse({protocol:'main-model-wire-v1',requestHash:digest(body),messagesHash:digest(messages),
  systemMessagesHash:digest(messages.filter(m=>m&&typeof m==='object'&&m.role==='system')),toolSchemaHash:digest(tools),settingsHash:digest(settings),settings,
  requestedModel:body.model,response:{model:typeof result.model==='string'?result.model:null,provider:typeof result.provider==='string'?result.provider:null,
   generationId:typeof result.id==='string'?result.id:null,modelMatchesRequested:typeof result.model==='string'&&matchesBatchModel(result.model,body.model)}});
}

/** Integrity comparison only: neither a hash nor a matching provider receipt grants quality acceptance. */
export function assertModelRequestManifest(body:Record<string,unknown>,input:unknown){
 const manifest=modelRequestManifestSchema.parse(input);
 const expected=modelRequestManifest(body,{model:manifest.response.model,provider:manifest.response.provider,id:manifest.response.generationId});
 if(digest(expected)!==digest(manifest))throw new Error('Model request manifest mismatch');
 return manifest;
}
