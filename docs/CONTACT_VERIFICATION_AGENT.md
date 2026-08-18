# Contact Verification Agent Design

## 1. Purpose

The Contact Verification Agent turns crawler-produced contact candidates into explainable, auditable sales-contact decisions. It uses DeepSeek to interpret evidence and identify conflicts, while deterministic rules own the final category and score. The model cannot promote a candidate by bypassing a hard rule.

The agent does not discover the market, send sales outreach, or silently treat guessed addresses as verified. It consumes public-web evidence, may request bounded evidence searches, and produces one of three active categories:

- `Official`: a general company contact published on the confirmed official website.
- `HighConfidence`: a named, relevant-role contact with strong employment and email evidence.
- `NeedsReview`: an incomplete, conflicting, low-quality, or pattern-guessed contact.

`Invalid` is a separate lifecycle state, not a fourth active category. It removes a technically invalid address from usable contact queues while preserving the audit record.

## 2. Design principles

1. Contact accuracy, role relevance, reachability, and email delivery state are separate facts.
2. Company size changes the development effectiveness of a general official channel, not its authenticity.
3. LinkedIn is extremely strong evidence for a person's employer and role when the record is current and obtained through an authorized or user-supplied path. It is not proof that a guessed email belongs to that person.
4. Search-result snippets are discovery hints. A claim requires a retrievable source page or an explicitly retained human-reviewed record.
5. A guessed email is always `NeedsReview` until direct public evidence or explicit recipient confirmation is obtained.
6. SMTP acceptance or the absence of a bounce is not recipient confirmation.
7. Every decision must cite stored evidence and deterministic rule IDs.
8. Re-running the same rules over the same normalized evidence must produce the same category.

## 3. System boundary

```text
Crawler and search jobs
  -> contact candidates + source snapshots
  -> Contact Verification Agent
       -> evidence normalization
       -> bounded evidence-gap requests
       -> DeepSeek evidence assessment
       -> deterministic decision engine
       -> review queue or accepted contact
       -> optional delivery-verification job (separate approval boundary)
```

DeepSeek performs semantic work:

- identify whether a passage names the person, employer, and role;
- normalize multilingual job titles;
- distinguish current employment from historical employment;
- describe evidence agreement and conflict;
- identify whether a source is a profile, company page, directory, article, or search snippet;
- return structured findings with quoted evidence spans.

Application code performs authoritative work:

- domain ownership and official-site checks;
- generic versus personalized mailbox classification;
- DNS and MX checks;
- source acquisition policy enforcement;
- company-size and channel-effectiveness calculations;
- score calculation, hard gates, category assignment, and invalidation;
- persistence, audit logging, retries, and human-review routing.

## 4. DeepSeek provider strategy

The provider uses the existing `AiProvider` boundary and an OpenAI-compatible `POST /chat/completions` request to `https://api.deepseek.com`. Configuration remains environment-driven:

```text
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_ESCALATION_MODEL=deepseek-v4-pro
```

Recommended routing:

- `deepseek-v4-flash`: routine evidence extraction and source classification.
- `deepseek-v4-pro`: conflicting employer/role evidence, ambiguous names, or failed first-pass schema validation.

The model must use JSON output, with local runtime validation after parsing. Empty content, truncated JSON, schema failure, HTTP 429, and provider overload are explicit failures. A model failure never produces an accepted classification; the record remains `NeedsReview` with a provider warning.

The prompt version, requested model, returned model, latency, token usage, warnings, and evidence IDs are persisted for every run. Secrets stay server-side.

## 5. Input contract

```ts
interface ContactVerificationInput {
  workspaceId: string;
  company: {
    id: string;
    canonicalName: string;
    officialDomains: string[];
    employeeCount?: number;
    localEmployeeCount?: number;
    sizeEvidenceIds: string[];
    ownerLedSignals: string[];
  };
  candidate: {
    contactId?: string;
    fullName?: string;
    jobTitle?: string;
    email?: string;
    phone?: string;
    derivation: "direct-public" | "cross-source" | "pattern-guessed" | "unknown";
  };
  evidence: ContactEvidenceInput[];
  requestedAt: string;
}

interface ContactEvidenceInput {
  evidenceId: string;
  url: string;
  sourceType:
    | "official-website"
    | "authorized-linkedin-profile"
    | "authorized-linkedin-company"
    | "public-professional-source"
    | "business-directory"
    | "search-snippet";
  title: string;
  excerpt: string;
  capturedAt: string;
  publishedAt?: string;
  contentHash?: string;
  humanReviewed: boolean;
}
```

`localEmployeeCount` is preferred over global parent-company size when a local operating unit is the actual sales target. Unknown size is represented as unknown, not silently treated as small.

## 6. Output contract

```ts
interface ContactVerificationDecision {
  category: "Official" | "HighConfidence" | "NeedsReview";
  lifecycleStatus: "Active" | "Invalid";
  contactType: "GeneralMailbox" | "NamedPerson" | "Unknown";
  confidenceScore: number;
  roleRelevanceScore: number;
  reachabilityScore: number;
  developmentPriority: number;
  employmentStatus: "Confirmed" | "Probable" | "Historical" | "Conflicting" | "Unknown";
  emailEvidenceStatus:
    | "OfficialPublic"
    | "CrossConfirmed"
    | "ThirdPartyPublic"
    | "PatternGuessed"
    | "Conflicting"
    | "Unknown";
  deliveryStatus:
    | "NotTested"
    | "MxValid"
    | "AcceptedByServer"
    | "NoNegativeSignal"
    | "TemporaryFailure"
    | "PolicyRejected"
    | "HardBounced"
    | "RecipientConfirmed";
  matchedRuleIds: string[];
  evidenceIds: string[];
  reasons: string[];
  reviewFlags: string[];
  modelAssessmentId?: string;
  decidedAt: string;
}
```

`developmentPriority` ranks work; it never changes the category:

```text
confidenceScore * 0.30
+ roleRelevanceScore * 0.40
+ reachabilityScore * 0.30
```

## 7. Deterministic category rules

Rules are evaluated in precedence order.

### Invalid lifecycle

Set `lifecycleStatus=Invalid` only for a durable, attributable failure such as:

- invalid syntax after normalization;
- confirmed mail domain or routing does not exist;
- recipient-domain delivery result explicitly reports permanent bad destination mailbox (`5.1.1`);
- a human reviewer confirms the address belongs to another organization or person.

Mailbox-full, temporary (`4.x.x`), sender-policy, reputation, SPF, DKIM, DMARC, or spam rejection does not prove the recipient address is invalid.

### Official

All gates must pass:

- the address is a recognized general mailbox;
- the exact address appears in retained content from a confirmed official company domain;
- the page was fetched successfully and the evidence span contains the address;
- no domain-ownership conflict exists.

The normal confidence range is 95-100. Company size does not reduce it.

### HighConfidence

All gates must pass:

- a normalized person name and relevant job title exist;
- current employment is `Confirmed` or strong `Probable` without conflict;
- the email uses a confirmed company domain;
- derivation is not `pattern-guessed`;
- exact person-to-email evidence is present on the official site, or official employment evidence is combined with the exact email on a strong independent source, or two strong independent sources agree;
- syntax and MX checks pass;
- `confidenceScore >= 80`;
- no hard review flag exists.

### NeedsReview

Use this category whenever an Official or HighConfidence gate fails, including guessed patterns, LinkedIn-only identity without direct email evidence, stale employment, free-mail addresses, domain mismatch, weak directories, search snippets, or source conflicts.

## 8. LinkedIn evidence policy

For role and employment claims:

- a current full personal profile obtained through an authorized or user-supplied path is extremely high-confidence evidence;
- agreement between the personal profile and company page is stronger;
- recent role-related activity may improve recency confidence;
- a search snippet is only a medium-confidence lead;
- a stale, cached, or inaccessible profile cannot independently confirm current employment;
- a LinkedIn record never validates an email that it does not explicitly display.

Unauthorized automated LinkedIn scraping is outside the agent boundary. LinkedIn evidence records must carry acquisition method and review provenance. The relevant platform restrictions are documented in LinkedIn's current [Crawling Terms](https://www.linkedin.com/legal/crawling-terms) and [prohibited software guidance](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions?lang=en).

## 9. Company-size effectiveness model

Company size modifies only the reachability of general official channels. It uses the target operating unit where possible.

### General-channel base scores

| Channel | Base reachability |
|---|---:|
| `sales@`, `ventas@`, commercial inquiry | 60 |
| `info@`, `contact@`, `contacto@` | 45 |
| general web form | 35 |
| `support@`, `soporte@` | 25 |
| `admin@`, `office@` | 20 |

### Size adjustment

| Local employee count | Adjustment |
|---|---:|
| 1-10 | +25 |
| 11-50 | +15 |
| 51-200 | 0 |
| 201-1,000 | -15 |
| More than 1,000 | -25 |
| Unknown | 0 plus `company-size-unknown` review flag |

### Organizational adjustments

- owner-led evidence: +15;
- local branch-specific channel: +10;
- only one public business channel: +10;
- centralized support or ticketing: -15;
- support-only statement: -20;
- IVR or multi-stage routing: -15.

The result is clamped to 0-100. All modifiers must be evidence-backed and surfaced in `matchedRuleIds`.

## 10. Delivery verification boundary

Outbound verification is a later, separately approved capability. It is not enabled by the first implementation stage.

When enabled, the agent calls a constrained Delivery Verification Worker rather than composing and sending arbitrary mail. The worker requires:

- an owned, transparent verification subdomain with SPF, DKIM, and DMARC;
- a fixed, reviewed template and sender identity;
- company allowlist or per-batch human approval;
- one attempt per candidate, rate and daily-volume limits;
- no tracking pixels, attachments, deceptive identity, or sales content;
- durable storage of provider message ID, SMTP/DSN codes, timestamps, and raw normalized result;
- automatic suppression after a permanent hard bounce;
- a jurisdiction and privacy-policy checkpoint before activation.

Delivery interpretation:

- explicit permanent `5.1.1`: `HardBounced`, lifecycle `Invalid`;
- temporary `4.x.x`: `TemporaryFailure`, retry only under policy;
- mailbox full: evidence that a mailbox may exist, not invalid;
- policy/spam rejection: `PolicyRejected`, not invalid;
- SMTP acceptance: `AcceptedByServer`, not system verification;
- no bounce after the observation window: `NoNegativeSignal`, not system verification;
- explicit reply or confirmation: `RecipientConfirmed`.

The status definitions follow the distinction between address, mailbox, and policy failures in [RFC 3463](https://www.rfc-editor.org/info/rfc3463/).

## 11. Persistence

The production implementation persists:

- `contact_verification_run`: orchestration, model, prompt, counts, and status;
- `contact_model_assessment`: raw structured DeepSeek assessment and usage metadata;
- `contact_verification_decision`: scores, category, rule IDs, and decision version;
- `contact_evidence_link`: exact evidence used by each claim and decision;
- `contact_review_queue`: review reason, priority, assignee state, and resolution;
- `company_email_candidate.verification_decision_id`: the current published decision while retaining the independent crawler source status.

`contact_delivery_attempt` remains outside the active system because outbound verification has not been approved.

Existing crawler findings remain immutable evidence. A new verification decision supersedes an older decision; it does not rewrite the historical source record.

## 12. Evaluation and release gates

Build a human-labelled benchmark before enabling automated acceptance:

- at least 20 official general contacts;
- at least 20 official named-person contacts;
- at least 20 cross-confirmed named contacts;
- at least 20 pattern guesses;
- at least 20 stale, conflicting, wrong-domain, or bounce examples;
- multilingual names and Spanish job titles;
- small, medium, large, and local-subsidiary examples.

Minimum release gates:

- zero guessed emails classified as `HighConfidence`;
- zero third-party-only general mailboxes classified as `Official`;
- at least 95% precision for `HighConfidence` on the benchmark;
- 100% of accepted decisions have reproducible evidence and rule IDs;
- deterministic category stability across repeated runs;
- provider failure routes to `NeedsReview`, never acceptance;
- outbound delivery remains disabled until its separate approval checkpoint.

## 13. Implementation stages and approval checkpoints

1. **Decision contract checkpoint**: approve categories, hard gates, scores, company-size bands, and LinkedIn evidence policy. Local operating-unit size is confirmed as the primary size measure; direct LinkedIn acquisition remains subject to an authorization-method decision.
2. Implement types, deterministic rules, benchmark fixtures, and tests without DeepSeek or outbound mail.
3. **DeepSeek checkpoint**: approve prompt, budget, retry, and evidence retention. Flash for routine work with Pro escalation for conflicts is confirmed.
4. Implement the DeepSeek provider and model-assessment orchestration in shadow mode.
5. Evaluate against the human-labelled benchmark and tune deterministic rules.
6. **Automation checkpoint**: approved for deterministic `Official` and `HighConfidence` decisions; all other outcomes require review.
7. Persistence, current-decision supersession, review routing, audit events, and score display are implemented. Scheduled re-verification remains future work.
8. **Outbound checkpoint**: approve sender domain, template, volume, observation window, and compliance controls.
9. Implement the Delivery Verification Worker behind a disabled-by-default feature flag.

## 14. First checkpoint questions

Before implementation begins, confirm:

1. Local operating-unit employee count is the primary company-size measure. Confirmed.
2. LinkedIn evidence enters through manual/user-supplied or other authorized records in the first release; proactive LinkedIn crawling is excluded. Confirmed.
3. Use `deepseek-v4-flash` for routine work and escalate material conflicts to `deepseek-v4-pro`. Confirmed.
