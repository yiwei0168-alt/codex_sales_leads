export interface WireTrace {wire: Array<{status?: number}>}
export class PaymentRequiredStop extends Error {constructor(key: string); key: string}
export function assertNoPaymentRequired(key: string, trace: WireTrace): void;
export function runGuardedBatch(keys: string[], callbacks: {
 readSaved: (key: string) => Promise<{trace: WireTrace} | null>;
 submit: (key: string) => Promise<{trace: WireTrace}>;
}): Promise<Array<{key: string; reused: boolean}>>;
