# CO Retail intent failure — v2.0.0

The first Colombia Retail cell stopped before Product discovery because Kimi changed the already-confirmed task from 50 Retailer/E-tailer companies to 20 companies across all ordinary channel roles. The frozen semantic guard rejected the plan. This is an intent-planner fidelity defect, not evidence of Colombia Retail scarcity.

The Gemini control completed independently with 15/50 returned candidates and remains valid because its model, prompt, market, category and requested count are unchanged. The failed Product attempt made no discovery, evidence, correction or scoring call.

Observed sunk cost retained in the experiment ledger:

- Kimi intent: 559 input tokens, 1,166 output tokens, 14.402 seconds, USD 0.0051770629; valid model output but 0 downstream task execution because confirmed constraints disagreed.
- Gemini control: 561 input tokens, 2,188 output tokens, 12 grounding queries, 16.776 seconds, 15 valid/downstream-used candidates, USD 0.1764651.
- Cumulative: USD 0.1816421629, below the first USD 10 budget review.

v2.0.1 keeps Kimi as the required lightweight intent/template-fit model. It strengthens the model instruction to copy explicit country/count/role constraints exactly and changes the formal harness to treat the preregistered user-confirmed plan as authoritative for execution. A divergent Kimi plan remains a recorded warning and paid output-efficiency loss; it cannot silently broaden or shrink confirmed execution scope. No Product search or scoring mechanism is changed.
