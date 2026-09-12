export interface ProviderUsageSummary {
  stage:string;
  provider:string|null;
  requestedModel:string|null;
  reportedModel:string|null;
  promptVersion:string|null;
  scoringVersion?:string|null;
  finishReason?:string|null;
  cacheInputHitRate?:number|null;
  gatewayHost:string|null;
  endpointKind:string|null;
  attempts:number;
  fields:Array<{field:string;reportedAttempts:number;total:string|null}>;
}
