# CO Distributor/VAD result v2.0.12

Date: 2026-09-09

## Result

- Gemini control: 20/50.
- Product: 13/50 after seven rounds; completion reason `confirmed-exhaustion`.
- Cell cost: USD 2.3886083303.
- Experiment cumulative cost: USD 11.8368383270.
- Forecast after two cells: USD 31.6736 expected, USD 45.5102 upper.

Product processed 398 raw search results, 75 new unique companies, 52 light-gate candidates, 51 corrected candidates, 21 requested-family candidates and 13 final eligible candidates. Final source contribution was Gemini Full five, Brave five and Exa three. SearchAPI remained quota-unavailable and produced no candidate.

## Interpretation

Both arms underfilled, so a 50-company validated Distributor/VAD pool is difficult under the frozen Colombia task. Product nevertheless trails the un-tuned control by seven filled slots. The main observed loss is role resolution: 25/51 corrected candidates were Unresolved, while 20 resolved as Distributor/VAD and 13 passed final eligibility. This is not a provider/model outage—schema-valid DeepSeek/OpenAI peer outputs were returned—but evidence was often insufficient to support an atomic Distributor/VAD action.

The Product cell spent USD 1.115 on discovery and USD 1.000 on Tavily evidence. Seven discovery rounds produced final additions of 6, 4, 3, 0, 0, 0 and 0, so later-round marginal value was zero. That pattern is retained for post-experiment stop-policy analysis; it is not tuned mid-experiment.

## Budget review

The mandatory USD 10 checkpoint was crossed during fresh evidence at cumulative USD 10.1746644570. There were no unpriced events or hard-stop risks. Completion of a second, independent category reduced the conservative upper forecast from USD 59.6814 to USD 45.5102. The prior one-cell budget warning is therefore resolved, and the frozen experiment may proceed to CO SI/MSP without additional budget authority.
