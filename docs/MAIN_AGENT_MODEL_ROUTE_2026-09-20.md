# Main Agent route diagnosis and MA10 migration

The user explicitly requested testing comparable OpenRouter models, then selected **GLM 5.3 (batch)** as the new main model. This replaces MA01's default model only. RAG v3, specialist routes, formal scoring and the opt-in rollout gate retain their existing configuration.

## Observed route failure

The official catalog contains the requested models and their providers. `GET /api/v1/key` returned 200; the key is not a free-tier key and has no configured per-key credit limit. This does not prove the account balance or every model permission.

| Model | Pinned provider | Text | Tool call |
|---|---|---|---|
| `openai/gpt-5.6-sol` | `openai` | 403, 1,254 ms | 403, 631 ms |
| `openai/gpt-6-astra` | `openai` | 403, 1,034 ms | 403, 405 ms |
| `anthropic/claude-opus-5` | `anthropic` | 403, 857 ms | 403, 403 ms |
| `google/gemini-3.1-pro-preview` | `google-ai-studio` | 403, 1,194 ms | 403, 415 ms |

All eight responses explicitly stated: “This model is not available in your region.” These were distinct public synthetic text/tool probes, with zero automatic retry, zero valid model outputs and unknown token/cost amounts. Network routing, account permissions and data-collection settings were not changed to bypass the restriction. This is provider availability evidence, not a model-quality failure or business disqualification.

## GLM result and transport

The official model ID is `z-ai/glm-5.3:batch`, served by `fireworks`. The Batch API receives base slug `z-ai/glm-5.3` at `/api/v1/batches`, endpoint `/v1/chat/completions`, with `provider.only=["fireworks"]` and a `24h` completion window. `endpoint`, `model`, `provider` and `completion_window` precede `requests`. The synchronous `parallel_tool_calls` preference is omitted because this batch endpoint does not advertise it. The Agent's executor still executes selected calls through individual safe boundaries.

One two-item public synthetic batch was accepted with 202 and later completed with both item responses HTTP 200. Text matched `OK`; the tool response was exactly one `mark_probe` call with `{ "code": "OK" }`. The real response passed the production batch schema and model-message parser. Provider timestamps show **680 seconds** from creation to finalization, including queuing and processing.

Provider usage: **199 input tokens, 22 output tokens, 221 total; OpenRouter reported US$0.00018314, `is_byok=false`**. The raw amount is retained separately from the existing integer micro-dollar representation (rounded upward once to 184 micro-dollars). This is a provider report, not an independently verified cash invoice. Usage was appended to the original reservation; polls created no new inference reservations. There were no private task inputs, SMTP operations or customer record changes.

## Implementation and limits

Migration 097 adds tenant-isolated durable model batches and delayed run eligibility. Submission is recorded before transport; a saved remote ID is reused after restart. An uncertain submission is not automatically resubmitted. A receipt-only worker polls exact saved IDs, never a shared provider workspace batch listing. It continues recording late results and usage after task cancellation without executing more task actions. Final output is validated by batch/model/custom-item identity before becoming a model answer.

The LangGraph node yields the worker while waiting. Policies and new instructions are checked again before acting on model output; changed decisions receive new revision keys. Acknowledgements and pending polls are not counted as completed model answers. Completed approved actions remain protected by their original journals.

Batch routing accepts only `provider.only`; account data policy applies at OpenRouter. Keep provider data collection disabled in the OpenRouter account configuration. The synchronous `data_collection: deny` flag is not silently sent as an unsupported batch parameter. Batch storage is required for asynchronous execution; this is not a zero-retention claim. No credentials enter the batch body.

Code and local non-secret settings now select GLM/Fireworks. Existing runs retain their saved model configuration. The subsequent real main-Agent flow found a canonical-ID mismatch (`z-ai/glm-5.3-20260816` versus the directory alias); this was corrected and its original batch was recovered by exact custom ID without another submission. The flow then completed both model turns: capability discovery used 2,510 input / 114 output tokens at reported US$0.00200267, and final synthesis used 4,438 input / 554 output tokens at reported US$0.00432540. Both outputs were consumed by the graph. Combined provider-reported usage was 6,948 input / 668 output tokens and US$0.00632807; recorded batch latencies were 801,109 and 1,220,529 ms. The isolated public synthetic run completed with zero private inputs, external sends and unexpected actions. These latencies show the user-selected batch route is unsuitable for an interactive low-latency promise. The 120-case evaluation, broad business capability coverage and overall P0–P6 release remain pending.

Official references: [GLM 5.3 batch model](https://openrouter.ai/z-ai/glm-5.3%3Abatch), [Batch API protocol, pricing and retention](https://openrouter.ai/docs/batch-quickstart), [current key inspection](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).
