import {z} from 'zod';
import {digest} from './contracts';
import {auditModelProtocol} from './model-protocol-audit';
import {modeConfigSchema} from './mode-config';
import {modelFunctions,transportMessages,type modelReplySchema} from './model';
import {modelRequestManifestSchema,assertModelRequestManifest} from './model-request-manifest';
import type {ModelMessage} from './contracts';

export type RecordedModelCall={input:unknown;input_hash:string;output:unknown};
/** Internal preparation only. Contains private messages: never log, expose to clients or send without a separate grant.
 * The caller must establish server-owned journal provenance and revalidate source permissions before execution.
 * This is one exact historical request, not a whole-task replay or evidence of quality.
 */
export function prepareRecordedModeRequest(call:RecordedModelCall){
 const frozen=structuredClone(call),audit=auditModelProtocol(frozen);
 if(!audit.bound)throw new Error(`Recorded request unavailable: ${audit.reason}`);
 const input=z.object({profile:modeConfigSchema,index:z.number().int().min(0).max(2),messages:z.array(z.unknown())}).parse(frozen.input);
 const output=z.object({data:z.object({value:z.object({requestManifest:modelRequestManifestSchema})})}).parse(frozen.output);
 const manifest=output.data.value.requestManifest;
 // auditModelProtocol already validates the full message schema and current tool definitions.
 const messages=transportMessages(input.messages as Array<z.infer<typeof modelReplySchema>&ModelMessage>);
 const body=structuredClone({...manifest.settings,messages,tools:modelFunctions});
 assertModelRequestManifest(body,manifest);
 return {protocol:'recorded-mode-request-preparation-v1' as const,
  journalHash:digest(frozen),requestHash:manifest.requestHash,body,
  selectedRoute:structuredClone(input.profile.routes[input.index]),routeIndex:input.index,
  profile:structuredClone(input.profile),deadlines:{firstOutputMs:input.profile.firstOutputMs,totalMs:input.profile.totalMs},
  originalResponse:structuredClone(manifest.response),
  scope:'one-recorded-model-request' as const,serverProvenanceVerified:false as const,
  sourcePermissionsRevalidated:false as const,executionAuthorized:false as const,qualityAccepted:false as const};
}
