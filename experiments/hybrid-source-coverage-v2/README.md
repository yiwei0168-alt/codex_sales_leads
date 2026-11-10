# Prospective registered-original coverage

V13's frozen checker rejects actual V3 asset links because it only knows historical fixture URLs. This successor requires the exact frozen document ID, full normalized-body SHA-256 and either its bound fixture URL or bound authenticated asset URL. A conflicting metadata asset ID fails. Complete, non-reconstructed revision bodies are accepted only with matching document and content hashes. Original-file listings alone are not body reads.

This applies to the known, whole-document synthetic fixture. It must not be generalized to partial chunks without a separately registered chunk/coordinate contract. P01/P07/P08 retain existing checks. `validate-saved.ts` performs zero-model regression against all 18 V13 traces and typed read outputs; it does not replace old grades, reopen V13, or establish new independent acceptance. Future qualification must freeze this implementation before submitting tasks.
