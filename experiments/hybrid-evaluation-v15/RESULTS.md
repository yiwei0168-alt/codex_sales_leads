# V15 stopped by the registered transport circuit breaker

Two tasks submitted, both partial; 16 first-repeat tasks and 36 later repetitions not submitted. Known task cost $0.012553 plus three unknown charges. No review calls, no acceptance claim. Historical 57 unknown charges remain separate. All submitted tasks have saved observations; the circuit breaker stopped before the third submission, with no forced termination, interrupted extra task or active isolated job.

Authenticated key and credit GET requests succeeded before the run, but generation requests then suffered transport/stream failures. The registered two-consecutive-failure control operated as intended. Preserve these outcomes; do not retry or continue the same freeze after changing transport.

Zero-model, unauthenticated path diagnosis after the run: current explicit proxy failed twice with ECONNRESET before request headers, at 5,044 and 5,007 ms. An explicit direct diagnostic dispatcher reached the same official OpenRouter endpoint twice, receiving expected HTTP 401 at 1,383 and 863 ms. No credentials or business content were sent in this comparison. This supports a current proxy-path problem; it does not establish model-generation reliability or isolate the exact proxy/upstream component.

MA18/MA19 confirmed product rules require OpenAI/Claude and unidentified OpenRouter gateway requests through the local proxy. No paid request was switched to direct and no production configuration changed. User preference is pending between repairing the existing proxy and temporarily allowing direct access only for isolated evaluation. The only listener among common local proxy ports was 127.0.0.1:7892. The local proxy was not restarted or reconfigured.

Evidence: [task observations](results/progress.json), [transport failures](results/network-phases.json), [unauthenticated path comparison](results/path-diagnostics.json). The typed read-contract changes still need successful live qualification; quality, latency/cost and full evaluation remain open.
