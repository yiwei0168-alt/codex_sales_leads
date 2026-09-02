# Frozen independent blind-judge rubric

The judge receives a de-identified packet ID, target market, requested category, the frozen Cudy brief, normalized company identity and an evidence bundle. It does not receive experiment arm, discovery tool, model, rank, product score, account tier or internal review outcome.

The judge must not browse the Web or use unstated company knowledge. Unsupported facts are unknown, not false. Score only the supplied frozen evidence.

## Required output

Return strict JSON with:

- `packetId`;
- `isRealOperatingCompany`;
- `operatesInTargetMarket`;
- `supportedRoles`;
- `primaryRole`;
- `requestedCategoryMatch`;
- five dimension scores;
- deterministic total of the five dimensions;
- `eligibility`: `eligible`, `research-required`, `ineligible-for-current-task`, or `insufficient-evidence-for-recommendation`;
- concise reason for each dimension;
- supporting evidence IDs for every factual conclusion;
- unsupported or contradictory claims;
- citation-alignment decision.

## Scoring

1. Product and use-case fit — 0–50
   - Best supported Cudy product family fit: 0–25
   - Actual target customer and scenario overlap: 0–15
   - Positioning compatibility: 0–10

2. Channel and buying influence — 0–15
   - Use the role's actual ability to select, procure, specify, resell or influence networking products.

3. Same-role scale and coverage — 0–15
   - Compare scale only with companies in the same target market and primary role.
   - Do not penalize a strategic distributor because its channel structure is complex.

4. Execution and enablement — 0–10
   - Commercial execution, technical delivery, enablement, support, fulfilment and continuity, interpreted by role.

5. Opportunity and risk — 0–10
   - Supported partnership openness, timing and structural/competitive risk.

## Role-specific interpretation

- Distributor/VAD: downstream channel reach, networking portfolio, vendor onboarding, procurement, inventory/logistics, credit, training and technical enablement.
- Reseller/VAR: B2B/SMB customer reach, networking resale, pre-sales, integration, support and repeatable value-added service.
- Retailer/E-tailer: consumer audience, home/SOHO networking relevance, merchandising, category traffic, fulfilment, returns and consumer support.
- SI/MSP: B2B projects, office/hospitality/education/retail/campus scenarios, network design/deployment, managed service and technical continuity.

A company focused on an SMB product family is not less relevant merely because a broadline distributor has more product families. Retail and SI/MSP customers must not be judged with the same customer profile.

## Thresholds

- `>=75`: high-value/actionable
- `65–74`: qualified
- `<65`: low priority or insufficient evidence
- invalid identity, no target-market operation or wrong requested primary role: slot utility zero
