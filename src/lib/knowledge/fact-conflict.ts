export interface FactConflictIdentity {
  entityId: string;
  entityVersion: string | null;
  market: string | null;
  attributeKey: string;
  typedValue: unknown;
}

/** Scalar attributes conflict within an exact entity/version/market slot; set members conflict only with the same member. */
export function knowledgeFactConflictKey(identity: FactConflictIdentity, setAttributes: ReadonlySet<string>): string {
  return JSON.stringify([
    identity.entityId,
    identity.entityVersion,
    identity.market,
    identity.attributeKey,
    setAttributes.has(identity.attributeKey) ? identity.typedValue : null,
  ]);
}
