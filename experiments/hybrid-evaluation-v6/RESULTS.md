# Repaired paired smoke v6 — not accepted

Nine runs completed under the registered persistent-process protocol: six answered, three partial because of transport failures. Known task cost USD 0.232673204 plus four unknown charges; earlier unresolved charges remain 22. Blinded review cost USD 0.107262 is separate. No retry, production deployment or gate reduction.

Raw blinded quality review passed 4/9. Two P02 scores are disputed: the baseline actually read four bodies, while the reviewer assumed three; the fixed answer disclosed four events / three bodies but was penalized for not printing literal hasMore=false and not repeating the oldest event, neither required by a latest-progress request. Preserve both raw scores; do not silently mark them passed. Three transport-partial answers fail completeness.

Subsequent separately frozen coverage adjudication supplied actual per-answer receipts without prior scores/arms/costs. Both P02 answers passed unchanged rubric/gates (see ../hybrid-quality-adjudication-v6/results/review.json); adjudicated model-assisted quality is 6/9, still below 95%. Adjudication cost USD 0.049028 is separate. Original scores and disagreement reasons remain preserved; no human Gold claim.

P10 all three arms passed blind review and mechanical range/pagination verification: two pages, 40 unique messages, Beijing daily counts 8/12/12/8, final hasMore=false. On this one quality-matched task, C/A enqueue-to-terminal reduction is 18.49%, cost reduction 19.62%, both below the 20% targets. B/A latency improved 23.14%, but cost increased 43.92%. Fewer model calls alone do not establish savings. P95/generalization cannot be established from one matched task.

P10-C did use a program, but initial Jev context_ready probability 0.50 fell below unchanged 0.55 threshold; the dynamic GPT-6.1 Sol profile then selected programmatic_tools. It did not select the configured cheaper interpreter profile. This motivates a separately versioned context-description candidate, not a threshold decrease or rescoring of v6.

Network evidence distinguishes initial/header failures from mid-response stream resets. First P24-C router timed out awaiting headers; P02-C main request reset before headers; P24 A/B failed mid-response after HTTP 200. Exact external component remains unknown. The separately verified SSE EOF repair reduces avoidable local connection churn, but does not establish that this external path is reliable.

Evidence: results/progress.json, results/network-phases.json, results/performance-runtime-freeze.json and ../hybrid-evaluation-quality-v6/results/{review,audit}.json. Still needed: connection stability, adjudicated quality, candidate scope routing validation, broader/repeated paired cases and complete cost receipts. No overall acceptance or 20% improvement claim.
