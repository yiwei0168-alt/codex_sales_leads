import type { AiProvider, StructuredAiResponse } from "@/providers/contracts";
import { verifyContact } from "./decision-engine";
import type {
  ContactEvidenceAssessment,
  ContactSourceType,
  ContactVerificationDecision,
  ContactVerificationInput,
  EvidenceAcquisitionMethod,
} from "./types";

export interface ContactEvidenceDocument {
  evidenceId: string;
  sourceType: ContactSourceType;
  acquisitionMethod: EvidenceAcquisitionMethod;
  acquisitionAuthorized: boolean;
  sourceKey: string;
  url: string;
  title: string;
  excerpt: string;
  capturedAt: string;
  publishedAt?: string;
}

export interface ContactVerificationAgentInput extends Omit<ContactVerificationInput, "evidence"> {
  evidence: ContactEvidenceDocument[];
}

export interface ModelFinding {
  evidenceId: string;
  personPresent: boolean;
  rolePresent: boolean;
  currentEmploymentPresent: boolean;
  historicalEmploymentPresent: boolean;
  personEmailBound: boolean;
  conflict: boolean;
  rationale: string;
}

export interface ContactModelAssessment {
  findings: ModelFinding[];
  needsEscalation: boolean;
  conflicts: string[];
  warnings: string[];
}

interface ContactModelRequest {
  instructions: string[];
  company: ContactVerificationAgentInput["company"];
  candidate: ContactVerificationAgentInput["candidate"];
  evidence: Array<Pick<ContactEvidenceDocument, "evidenceId" | "sourceType" | "url" | "title" | "excerpt" | "capturedAt" | "publishedAt">>;
  outputExample: ContactModelAssessment;
}

export interface ContactVerificationShadowResult {
  decision: ContactVerificationDecision;
  publish: false;
  modelVersion?: string;
  promptVersion: string;
  escalated: boolean;
  providerWarnings: string[];
  providerRequestIds: string[];
  totalTokens: number;
  modelTraces: Array<{
    modelVersion: string;
    promptVersion: string;
    latencyMs: number;
    warnings: string[];
    providerRequestId?: string;
    usage?: StructuredAiResponse<unknown>["usage"];
    output: ContactModelAssessment;
  }>;
}

interface ContactVerificationAgentOptions {
  routineModel?: string;
  escalationModel?: string;
  promptVersion?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`Contact model assessment field ${key} must be boolean`);
  return value;
}

function parseModelAssessment(value: unknown, evidenceIds: string[]): ContactModelAssessment {
  if (!isRecord(value) || !Array.isArray(value.findings) || typeof value.needsEscalation !== "boolean" ||
    !isStringArray(value.conflicts) || !isStringArray(value.warnings)) throw new Error("Invalid contact model assessment envelope");
  const expected = new Set(evidenceIds);
  const seen = new Set<string>();
  const findings = value.findings.map((item): ModelFinding => {
    if (!isRecord(item) || typeof item.evidenceId !== "string" || !expected.has(item.evidenceId) || seen.has(item.evidenceId)) {
      throw new Error("Contact model assessment contains an unknown, missing, or duplicate evidence ID");
    }
    seen.add(item.evidenceId);
    if (typeof item.rationale !== "string") throw new Error("Contact model assessment rationale must be a string");
    return {
      evidenceId: item.evidenceId,
      personPresent: requiredBoolean(item, "personPresent"),
      rolePresent: requiredBoolean(item, "rolePresent"),
      currentEmploymentPresent: requiredBoolean(item, "currentEmploymentPresent"),
      historicalEmploymentPresent: requiredBoolean(item, "historicalEmploymentPresent"),
      personEmailBound: requiredBoolean(item, "personEmailBound"),
      conflict: requiredBoolean(item, "conflict"),
      rationale: item.rationale,
    };
  });
  if (seen.size !== expected.size) throw new Error("Contact model assessment omitted required evidence IDs");
  return { findings, needsEscalation: value.needsEscalation, conflicts: value.conflicts, warnings: value.warnings };
}

function containsExactEmail(excerpt: string, email?: string): boolean {
  if (!email) return false;
  return excerpt.toLocaleLowerCase("en").includes(email.trim().toLocaleLowerCase("en"));
}

function assessmentsFromModel(
  input: ContactVerificationAgentInput,
  assessment: ContactModelAssessment,
): ContactEvidenceAssessment[] {
  const findings = new Map(assessment.findings.map((item) => [item.evidenceId, item]));
  return input.evidence.map((document) => {
    const finding = findings.get(document.evidenceId)!;
    const exactEmailPresent = containsExactEmail(document.excerpt, input.candidate.email);
    return {
      evidenceId: document.evidenceId,
      sourceType: document.sourceType,
      acquisitionMethod: document.acquisitionMethod,
      acquisitionAuthorized: document.acquisitionAuthorized,
      sourceKey: document.sourceKey,
      capturedAt: document.capturedAt,
      publishedAt: document.publishedAt,
      exactEmailPresent,
      personPresent: finding.personPresent,
      rolePresent: finding.rolePresent,
      currentEmploymentPresent: finding.currentEmploymentPresent,
      historicalEmploymentPresent: finding.historicalEmploymentPresent,
      personEmailBound: exactEmailPresent && finding.personEmailBound,
      conflict: finding.conflict,
    };
  });
}

function unknownAssessments(input: ContactVerificationAgentInput): ContactEvidenceAssessment[] {
  return input.evidence.map((document) => ({
    evidenceId: document.evidenceId,
    sourceType: document.sourceType,
    acquisitionMethod: document.acquisitionMethod,
    acquisitionAuthorized: document.acquisitionAuthorized,
    sourceKey: document.sourceKey,
    capturedAt: document.capturedAt,
    publishedAt: document.publishedAt,
    exactEmailPresent: containsExactEmail(document.excerpt, input.candidate.email),
    personPresent: false,
    rolePresent: false,
    currentEmploymentPresent: false,
    historicalEmploymentPresent: false,
    personEmailBound: false,
    conflict: false,
  }));
}

export class ContactVerificationAgent {
  private readonly routineModel: string;
  private readonly escalationModel: string;
  private readonly promptVersion: string;

  constructor(private readonly provider: AiProvider, options: ContactVerificationAgentOptions = {}) {
    this.routineModel = options.routineModel ?? process.env.DEEPSEEK_MODEL?.trim() ?? "deepseek-v4-flash";
    this.escalationModel = options.escalationModel ?? process.env.DEEPSEEK_ESCALATION_MODEL?.trim() ?? "deepseek-v4-pro";
    this.promptVersion = options.promptVersion ?? "contact-evidence-v1";
  }

  private request(input: ContactVerificationAgentInput, modelVersion: string) {
    const modelInput: ContactModelRequest = {
      instructions: [
        "Assess only the supplied evidence documents; output one finding for every evidenceId.",
        "A current role requires explicit current-tense employer and job-title evidence; do not infer it from a name alone.",
        "LinkedIn profile evidence is extremely strong for employer and role, but never proves an email unless that exact email appears in the evidence.",
        "Search snippets are leads, not conclusive proof.",
        "Mark conflict when the source contradicts the candidate, employer, role, or another supplied source.",
        "Return JSON matching outputExample exactly. Put uncertainty in warnings and request escalation for material ambiguity.",
      ],
      company: input.company,
      candidate: input.candidate,
      evidence: input.evidence.map(({ evidenceId, sourceType, url, title, excerpt, capturedAt, publishedAt }) =>
        ({ evidenceId, sourceType, url, title, excerpt, capturedAt, publishedAt })),
      outputExample: {
        findings: input.evidence.map((item) => ({
          evidenceId: item.evidenceId,
          personPresent: false,
          rolePresent: false,
          currentEmploymentPresent: false,
          historicalEmploymentPresent: false,
          personEmailBound: false,
          conflict: false,
          rationale: "Evidence-grounded reason",
        })),
        needsEscalation: false,
        conflicts: [],
        warnings: [],
      },
    };
    return {
      task: "contact-verification" as const,
      modelVersion,
      promptVersion: this.promptVersion,
      input: modelInput,
      evidenceIds: input.evidence.map((item) => item.evidenceId),
    };
  }

  async runShadow(input: ContactVerificationAgentInput, signal?: AbortSignal): Promise<ContactVerificationShadowResult> {
    const responses: Array<StructuredAiResponse<ContactModelAssessment>> = [];
    try {
      const routine = await this.provider.execute<ContactModelRequest, ContactModelAssessment>(this.request(input, this.routineModel), signal);
      responses.push(routine);
      let assessment = parseModelAssessment(routine.output, input.evidence.map((item) => item.evidenceId));
      const modelTraces: ContactVerificationShadowResult["modelTraces"] = [{
        modelVersion: routine.modelVersion, promptVersion: routine.promptVersion, latencyMs: routine.latencyMs,
        warnings: routine.warnings, providerRequestId: routine.providerRequestId, usage: routine.usage, output: assessment,
      }];
      let escalated = false;
      if (assessment.needsEscalation || assessment.conflicts.length > 0 || assessment.findings.some((item) => item.conflict)) {
        const escalation = await this.provider.execute<ContactModelRequest, ContactModelAssessment>(this.request(input, this.escalationModel), signal);
        responses.push(escalation);
        assessment = parseModelAssessment(escalation.output, input.evidence.map((item) => item.evidenceId));
        modelTraces.push({
          modelVersion: escalation.modelVersion, promptVersion: escalation.promptVersion, latencyMs: escalation.latencyMs,
          warnings: escalation.warnings, providerRequestId: escalation.providerRequestId, usage: escalation.usage, output: assessment,
        });
        escalated = true;
      }
      const decision = verifyContact({ ...input, evidence: assessmentsFromModel(input, assessment) });
      return {
        decision,
        publish: false,
        modelVersion: responses.at(-1)?.modelVersion,
        promptVersion: this.promptVersion,
        escalated,
        providerWarnings: [...responses.flatMap((item) => item.warnings), ...assessment.warnings],
        providerRequestIds: responses.flatMap((item) => item.providerRequestId ? [item.providerRequestId] : []),
        totalTokens: responses.reduce((total, item) => total + (item.usage?.totalTokens ?? 0), 0),
        modelTraces,
      };
    } catch (error) {
      const decision = verifyContact({ ...input, evidence: unknownAssessments(input) });
      return {
        decision: { ...decision, category: "NeedsReview", reviewFlags: [...decision.reviewFlags, "model-assessment-failed"] },
        publish: false,
        promptVersion: this.promptVersion,
        escalated: responses.length > 1,
        providerWarnings: [error instanceof Error ? error.message : "Unknown model-assessment failure"],
        providerRequestIds: responses.flatMap((item) => item.providerRequestId ? [item.providerRequestId] : []),
        totalTokens: responses.reduce((total, item) => total + (item.usage?.totalTokens ?? 0), 0),
        modelTraces: [],
      };
    }
  }
}
