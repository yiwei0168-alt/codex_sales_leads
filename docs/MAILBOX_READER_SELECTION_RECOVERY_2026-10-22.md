# Mailbox reader selection and recovery

## Existing MA24-16 F05/F06 scope

The unchanged 022ff304 actual React/Chrome reproduction selects an owned generated message and selects it again. The original disappears into an indefinite loading state while the detail request count remains exactly one. No second request starts because the ID state is unchanged. The list and detail success paths also lacked cancellation/selection guards and row validation.

Current client changes separate list and original retries, bind every read to a selection epoch, and validate complete page/message shapes plus exact selected message ID/direction. Selecting the current message starts a fresh read. List refresh retains a selected original while both requests run; a failed/malformed list clears old rows and the reader. Paging/return/direction changes invalidate the original. Ten-second independent list/detail deadlines permit explicit recovery, and ignored cancellation cannot replace a newer selection. Existing encrypted storage, owner-only HTTP reads, mailbox synchronization, learning authorization and external send rules are unchanged. No automatic mailbox/provider request is added.

## Verification status

Initial real-component browser reproduction failed as expected: detail requests before/after reselect were both 1, and the reader contained only the return control/loading text. The final component run **67805 exited 0** at 1366/390/320 widths: desktop same-message reselect, mobile return/reselect, delayed old response despite ignored cancellation, 503/malformed list clearing, wrong original identity refusal, original-only retry, paging and a real desktop ten-second deadline pass. Desktop/320 screenshots inspected. The two intermediate fixture failures are retained: mobile reading hides list/navigation, so the fixture now uses the actual return control before those actions. Product guards were not relaxed.

A strict isolated fixed-Web/schema-171 fixture now includes encrypted inbox/sent originals, anonymous/peer refusal, desktop reselect, existing one-shot failures, long/short learning originals and scrolling at desktop/mobile/short heights. Fixed packages and native acceptance remain pending. These generated sources do not establish real provider/document/business-answer quality or deployment; G14-G20 remain deferred.

Native attempts **84741** and diagnostic **28092** exited 1 and remain failed. The new option omitted the isolated mailbox encryption key: the existing generator/Web-container injection was conditional on the older frontend option, while the native child inherited another key. Current host fixture generates one temporary key for the new option and passes it to both fixed Web and the generated-content writer. Product code and image b5925222 are unchanged. TypeScript/two-file lint/diff check **53359 exited 0**; corrected native acceptance pending. No credential values are recorded.
