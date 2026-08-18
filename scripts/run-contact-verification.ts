import { resolveMx } from "node:dns/promises";
import nextEnv from "@next/env";
import { ContactVerificationAgent, type ContactEvidenceDocument } from "../src/lib/contacts/verification/agent";
import type { ContactVerificationInput } from "../src/lib/contacts/verification/types";
import { getPool, query, transaction } from "../src/lib/rag/db";
import { DeepSeekProvider } from "../src/providers/deepseek";
import { resolveTargetWorkspace } from "./resolve-target-workspace";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const workspaceId = (await resolveTargetWorkspace()).id;
const routineModel = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
const escalationModel = process.env.DEEPSEEK_ESCALATION_MODEL?.trim() || "deepseek-v4-pro";
const promptVersion = "contact-evidence-v1";
const timeoutMs = Math.max(1_000, Math.min(Number(process.env.CONTACT_VERIFICATION_TIMEOUT_MS ?? 30_000), 120_000));
const requestedCompanyLimit = Number(process.argv.find((value) => value.startsWith("--company-limit="))?.slice("--company-limit=".length) ?? 100);
const companyLimit = Math.max(1, Math.min(Number.isFinite(requestedCompanyLimit) ? Math.floor(requestedCompanyLimit) : 100, 100));
const requestedCandidateLimit = Number(process.argv.find((value) => value.startsWith("--candidate-limit="))?.slice("--candidate-limit=".length) ?? 1_000);
const candidateLimit = Math.max(1, Math.min(Number.isFinite(requestedCandidateLimit) ? Math.floor(requestedCandidateLimit) : 1_000, 1_000));
const requestedConcurrency = Number(process.argv.find((value) => value.startsWith("--concurrency="))?.slice("--concurrency=".length) ?? 4);
const concurrency = Math.max(1, Math.min(Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : 4, 8));

interface CandidateRow {
  email_candidate_id: string;
  company_id: string;
  contact_id: string | null;
  canonical_name: string;
  domain: string;
  record: unknown;
  full_name: string | null;
  job_title: string | null;
  email: string;
  email_status: string;
  derivation: string | null;
}

interface EvidenceRow {
  id: string;
  provider: string;
  source_kind: string;
  url: string;
  title: string;
  excerpt: string;
  captured_at: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positiveInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function employeeCounts(record: unknown): { employeeCount?: number; localEmployeeCount?: number } {
  const root = objectValue(record);
  const metadata = objectValue(root.metadata);
  return {
    employeeCount: positiveInteger(root.employeeCount ?? metadata.employeeCount),
    localEmployeeCount: positiveInteger(root.localEmployeeCount ?? metadata.localEmployeeCount),
  };
}

function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@").at(-1) ?? "";
}

function domainMatches(email: string, companyDomain: string): boolean {
  const mailDomain = emailDomain(email);
  const official = companyDomain.trim().toLowerCase().replace(/^www\./, "");
  return mailDomain === official || mailDomain.endsWith(`.${official}`);
}

async function mailRouting(domain: string): Promise<"Valid" | "Invalid" | "Unknown"> {
  if (!domain) return "Invalid";
  try {
    const records = await resolveMx(domain);
    return records.length > 0 ? "Valid" : "Unknown";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "EFORMERR") return "Invalid";
    return "Unknown";
  }
}

function sourceKey(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return url; }
}

function evidenceDocument(row: EvidenceRow): ContactEvidenceDocument {
  const linkedIn = /(^|\.)linkedin\.com$/i.test(sourceKey(row.url));
  return {
    evidenceId: row.id,
    sourceType: row.source_kind === "official-website" ? "OfficialWebsite" : linkedIn ? "LinkedInProfile" : "PublicProfessionalSource",
    acquisitionMethod: row.source_kind === "official-website" ? "PermittedCrawl" : "SearchIndex",
    acquisitionAuthorized: true,
    sourceKey: sourceKey(row.url),
    url: row.url,
    title: row.title,
    excerpt: row.excerpt,
    capturedAt: row.captured_at,
  };
}

function derivation(row: CandidateRow): ContactVerificationInput["candidate"]["derivation"] {
  if (row.email_status === "Pattern-guessed") return "pattern-guessed";
  if (row.email_status === "Public") return "direct-public";
  if (row.derivation?.toLowerCase().includes("source")) return "cross-source";
  return "unknown";
}

const provider = new DeepSeekProvider();
if (!provider.isConfigured()) throw new Error("DEEPSEEK_API_KEY is required to run contact verification.");
const agent = new ContactVerificationAgent(provider, { routineModel, escalationModel, promptVersion });

const candidates = await query<CandidateRow>(
  `with target_companies as (
     select c.id from workspace_company wc join sales_company c on c.id = wc.company_id
     where wc.workspace_id = $1 and c.source_kind = 'tavily-live'
     order by c.canonical_name limit $2
   )
   select em.id as email_candidate_id, em.company_id, em.contact_id, c.canonical_name, lower(c.domain) as domain,
          c.record, ct.full_name, ct.job_title, lower(em.email) as email, em.status as email_status, em.derivation
   from company_email_candidate em
   join sales_company c on c.id = em.company_id
   join target_companies tc on tc.id = c.id
   left join company_contact ct on ct.id = em.contact_id and ct.workspace_id = em.workspace_id
   where em.workspace_id = $1 and em.status <> 'Invalid'
   order by em.confidence desc, em.last_seen_at desc
   limit $3`,
  [workspaceId, companyLimit, candidateLimit],
);
if (candidates.length === 0) throw new Error("No active contact candidates are available for verification.");

const [run] = await query<{ id: string }>(
  `insert into contact_verification_run
     (workspace_id, mode, routine_model, escalation_model, prompt_version, target_count, timeout_ms, max_calls_per_contact, metadata)
   values ($1, 'shadow', $2, $3, $4, $5, $6, 2, $7) returning id`,
  [workspaceId, routineModel, escalationModel, promptVersion, candidates.length, timeoutMs,
    JSON.stringify({ requestedCompanyLimit, companyLimit, requestedCandidateLimit, candidateLimit,
      representedCompanyCount: new Set(candidates.map((candidate) => candidate.company_id)).size,
      concurrency, linkedinProactiveCrawl: false, outboundVerification: false })],
);

let processed = 0;
const failures: Array<{ email: string; error: string }> = [];

async function verifyCandidate(candidate: CandidateRow): Promise<void> {
  const evidenceRows = await query<EvidenceRow>(
    `select id, provider, source_kind, url, title, excerpt, captured_at
     from company_web_evidence where workspace_id = $1 and company_id = $2 order by captured_at desc limit 10`,
    [workspaceId, candidate.company_id],
  );
  const counts = employeeCounts(candidate.record);
  const routing = await mailRouting(emailDomain(candidate.email));
  const result = await agent.runShadow({
    company: {
      id: candidate.company_id,
      canonicalName: candidate.canonical_name,
      officialDomains: [candidate.domain],
      employeeCount: counts.employeeCount,
      localEmployeeCount: counts.localEmployeeCount,
    },
    candidate: {
      fullName: candidate.full_name ?? undefined,
      jobTitle: candidate.job_title ?? undefined,
      email: candidate.email,
      derivation: derivation(candidate),
    },
    evidence: evidenceRows.map(evidenceDocument),
    emailTechnical: {
      syntaxValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(candidate.email),
      companyDomainMatches: domainMatches(candidate.email, candidate.domain),
      mailRouting: routing,
      disposable: false,
    },
    requestedAt: new Date().toISOString(),
  }, AbortSignal.timeout(timeoutMs));

  await transaction(async (client) => {
    for (const [index, trace] of result.modelTraces.entries()) {
      await client.query(
        `insert into contact_model_assessment
           (run_id, company_id, email_candidate_id, sequence_number, provider, model_version, prompt_version,
            provider_request_id, latency_ms, prompt_tokens, completion_tokens, reasoning_tokens, total_tokens, output, warnings)
         values ($1, $2, $3, $4, 'deepseek', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [run.id, candidate.company_id, candidate.email_candidate_id, index + 1, trace.modelVersion, trace.promptVersion,
          trace.providerRequestId ?? null, trace.latencyMs, trace.usage?.promptTokens ?? 0, trace.usage?.completionTokens ?? 0,
          trace.usage?.reasoningTokens ?? 0, trace.usage?.totalTokens ?? 0, JSON.stringify(trace.output), trace.warnings],
      );
    }
    const decision = result.decision;
    const inserted = await client.query<{ id: string }>(
      `insert into contact_verification_decision
         (run_id, company_id, contact_id, email_candidate_id, shadow, category, lifecycle_status, contact_type,
          confidence_score, role_relevance_score, reachability_score, development_priority, employment_status,
          email_evidence_status, delivery_status, matched_rule_ids, evidence_ids, reasons, review_flags, decided_at)
       values ($1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::uuid[], $17, $18, $19)
       returning id`,
      [run.id, candidate.company_id, candidate.contact_id, candidate.email_candidate_id, decision.category,
        decision.lifecycleStatus, decision.contactType, decision.confidenceScore, decision.roleRelevanceScore,
        decision.reachabilityScore, decision.developmentPriority, decision.employmentStatus, decision.emailEvidenceStatus,
        decision.deliveryStatus, decision.matchedRuleIds, decision.evidenceIds, decision.reasons, decision.reviewFlags, decision.decidedAt],
    );
    if (decision.category === "NeedsReview" || decision.lifecycleStatus === "Invalid") {
      await client.query(
        `insert into contact_review_queue (decision_id, priority, review_flags) values ($1, $2, $3)`,
        [inserted.rows[0].id, decision.developmentPriority, decision.reviewFlags.length ? decision.reviewFlags : ["hard-gate-incomplete"]],
      );
    }
    await client.query(
      `update contact_verification_run set processed_count = processed_count + 1,
         escalated_count = escalated_count + $2, model_call_count = model_call_count + $3,
         total_tokens = total_tokens + $4 where id = $1`,
      [run.id, result.escalated ? 1 : 0, result.modelTraces.length, result.totalTokens],
    );
  });
  processed += 1;
  process.stdout.write(`${processed}/${candidates.length} ${candidate.canonical_name} ${candidate.email}: ${result.decision.category} (shadow)\n`);
}

try {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= candidates.length) return;
      const candidate = candidates[index];
      try {
        await verifyCandidate(candidate);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown candidate verification error";
        failures.push({ email: candidate.email, error: message });
        process.stderr.write(`FAILED ${candidate.canonical_name} ${candidate.email}: ${message}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
  if (failures.length > 0) throw new Error(`${failures.length} candidates failed verification.`);
  await query(`update contact_verification_run set status = 'completed', finished_at = now() where id = $1`, [run.id]);
  console.log(JSON.stringify({ runId: run.id, mode: "shadow", processed, routineModel, escalationModel, timeoutMs, concurrency }, null, 2));
} catch (error) {
  await query(
    `update contact_verification_run set status = 'failed', error_message = $2, finished_at = now() where id = $1`,
    [run.id, JSON.stringify({ message: error instanceof Error ? error.message : "Unknown contact verification error", failures })],
  );
  throw error;
} finally {
  await getPool().end();
}
