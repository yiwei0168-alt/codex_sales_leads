# V16 stopped — business qualification remains open

Five submissions: four answered, one partial. All five observations were persisted. The registered consecutive-transport-failure guard stopped before the sixth task. No review calls or repetitions were submitted; 13 first-repeat tasks and 36 later tasks remain unsubmitted. Known task cost $0.201722158 plus three unknown charges; historical 61 unknowns remain separate.

P19-A/B/C answered. B's Jev request exceeded its unchanged 2.5-second limit and has an unknown charge. P24-C received HTTP 200 but its main-model response stream failed with UND_ERR_SOCKET after about 27 seconds, leaving a partial task and unknown charge. P24-B answered after its Jev timed out before headers, also with unknown charge. No quality, total-cost or latency improvement claim is made from this incomplete sample. Short successful connection probes did not predict full-task streaming reliability.

The run exposed a concrete repair gap: proxy-pool retirement handled fetch/header failures, while a socket failure during later stream consumption escaped that handler. A subsequent source change binds each owned response to its originating pool and retires it on a known socket error during stream consumption, without replaying the failed call or evicting a replacement pool. This fix is outside V16's frozen runtime; V16 must not be resumed or relabeled. Nine transport tests and 20 stream/cancellation/receipt tests passed; no new paid run has qualified the stream-pool fix yet. Jev's deadline and unknown-fee handling remain unresolved.

Next: freeze a new candidate with stream-pool retirement; verify fault and receipt boundaries, then continue qualification. Full-24/live-external/challenges, routing holdout and browser timing remain outstanding. Production was not restarted.

Evidence: [all submissions](results/progress.json), [network phases](results/network-phases.json).
