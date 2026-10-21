# F08 task attachment upload progress

## Existing approved workflow

The task attachment dialog previously offered binary upload but only a receipt message telling the user to wait. It did not show the existing owner-scoped extraction jobs. Upload and library reads shared one busy flag: reopening or refreshing the dialog could clear that flag while a POST still awaited its response.

The dialog now separates upload and library-read state, with a synchronous upload lock and immutable in-flight category/model fields. Closing and reopening does not cancel or unlock that upload. Library reads have a ten-second deadline, abort superseded requests, reject malformed pages and keep existing selected names. A failed read hides old selectable rows; it does not turn an error into an empty result.

A read-only owner upload-progress section uses the existing authenticated GET, six jobs per page with a seventh-row sentinel, manual refresh and explicit loading/error/empty states. It displays extraction, review, indexing, searchable, historical, unavailable and failure states; unfamiliar status/scope values are explicitly unknown. No invented percentages or estimated completion times are shown. Failed/malformed reads clear old status rows. A link leads to the existing knowledge workspace for details, review or publishing.

An acknowledged upload states only that the original was saved; a reused job is identified separately. Missing or failed acknowledgement says the upload is unconfirmed and may have saved, offers readback and never automatically repeats a POST. The existing content/scope/extractor deduplication contract is unchanged. Only processed registered originals from the library list remain selectable; job IDs, status labels and upload receipts never become task attachments. No worker or model is started by viewing progress.

## Verification status

Three-width actual React/local-HTTP checks passed paging/status/unknown/malformed/read failure, retained selected original, held POST across close/reopen and read completion, dropped acknowledgement without automatic replay, reused receipt, private multipart scope and long-title wrapping. TypeScript and five-file lint passed. The initial state-in-effect/link lint findings were corrected; the standalone component bundle also needed Next Link's build-time environment constants, after which the same browser cases passed. These are engineering checks using synthetic responses.

The fresh-database fixed-Web fixture is prepared for actual upload persistence/deduplication, owner isolation, background acknowledgement, read failure, dropped responses, paging and refusal to submit a pending job as an asset. It deliberately does not run extraction or a model; failure statuses are explicitly injected in disposable rows. Build and native execution remain pending at this implementation stage. Real format/content quality and production entry are unverified; G14-G20 and deployment remain deferred.
