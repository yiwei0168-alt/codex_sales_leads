# V17 stopped after nine submissions — not qualified

Nine submitted tasks: eight answered, one partial. The first seven have complete billing. P08-C answered after Jev exceeded the fixed 2.5-second deadline; P08-B had another Jev timeout plus a main-model stream UND_ERR_SOCKET after about 27.6 seconds and ended partial. The registered consecutive-transport-failure circuit breaker stopped before submission ten. All nine observations were saved. Nine first-repeat tasks and 36 later repetitions were not submitted; no paid reviewer requests were made.

Known submitted cost $0.296658716 plus three unknown charges, in addition to 64 historical unknown charges. No unknown amount is assigned zero. The eight answered outputs have not passed blind quality review, so neither quality nor latency/cost acceptance is established. P07 saved assessments, P20 product recommendation and P01 latest progress were not reached. Early successful streaming does not establish sustained network reliability or prove the pool repair fixed the upstream disconnect cause.

The repaired pool can retire after a socket failure; it cannot prevent the upstream/local proxy from interrupting an in-flight response. Do not add an automatic paid retry or loosen the 2.5-second router gate merely to make this run pass. Preserve V17 frozen sources and results. Next work must distinguish actual proxy/upstream stream reliability from the router-deadline/late-billing design, then register a new candidate. Production was not restarted or reconfigured.

Source checks are zero-model diagnostics only; they do not replace the missing blind answer review. Evidence: [all observations](results/progress.json), [network failures](results/network-phases.json), [source coverage](results/source-diagnostics.json).
