import { tenantQuery } from "../../rag/db";
import type { Ma24G15Preview } from "./ma24-g15-runtime-binding";

export type Ma24EvaluationHardLimitRow = {
  maximum_provider_requests: string; maximum_request_bytes: string;
  maximum_output_tokens: string; hard_spend_cap_micros: string;
  authorized_at: Date | string; authorization_reference: string;
};

const positive = (value: number | null | undefined) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const whole = (value: string) => {
  if (!/^\d+$/.test(value)) throw new Error("MA24 hard limit row invalid");
  return BigInt(value);
};

/** Convert the reviewed USD ceiling exactly, with at most six decimal places. */
export function ma24SpendCapMicros(value: number | null | undefined): bigint {
  const text = String(value);
  if (!/^[0-9]+(?:\.[0-9]{1,6})?$/.test(text))
    throw new Error("MA24 hard spend cap needs exact micro-USD precision");
  const [dollars, fraction = ""] = text.split(".");
  const micros = BigInt(dollars) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0") || "0");
  if (micros <= BigInt(0) || micros > BigInt("9223372036854775807"))
    throw new Error("MA24 hard spend cap outside database bounds");
  return micros;
}

export function assertMa24EvaluationHardLimit(preview: Ma24G15Preview,
  row: Ma24EvaluationHardLimitRow | undefined) {
  if (!row || !positive(preview.maximumProviderRequests) ||
    !positive(preview.maximumRequestBytes) || !positive(preview.maximumOutputTokens) ||
    !preview.paidCallAuthorizationReference?.trim() ||
    !Number.isFinite(new Date(row.authorized_at).getTime()))
    throw new Error("MA24 authorized hard limit missing");
  const expected = [BigInt(preview.maximumProviderRequests!),
    BigInt(preview.maximumRequestBytes!), BigInt(preview.maximumOutputTokens!),
    ma24SpendCapMicros(preview.hardSpendCapUsd)];
  const actual = [row.maximum_provider_requests, row.maximum_request_bytes,
    row.maximum_output_tokens, row.hard_spend_cap_micros].map(whole);
  if (actual.some((value, index) => value !== expected[index]) ||
    row.authorization_reference !== preview.paidCallAuthorizationReference)
    throw new Error("MA24 authorized hard limit differs from frozen preview");
  return row;
}

/** The database reader exposes only the cap tied to this owner's evaluation run. */
export async function verifyMa24EvaluationHardLimit(input: {
  userId: string; runId: string; manifestSha256: string; preview: Ma24G15Preview;
}) {
  if (!/^[0-9a-f]{64}$/.test(input.manifestSha256))
    throw new Error("MA24 frozen manifest hash required for hard limit");
  const rows = await tenantQuery<Ma24EvaluationHardLimitRow>(input.userId,
    "select * from read_ma24_evaluation_hard_limit($1::uuid,$2::uuid,$3::text)",
    [input.userId, input.runId, input.manifestSha256]);
  if (rows.length !== 1) throw new Error("MA24 authorized hard limit missing");
  return assertMa24EvaluationHardLimit(input.preview, rows[0]);
}
