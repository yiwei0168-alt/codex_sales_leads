# V9 quick interpreter — quality/cost passed, latency failed

All three answers passed the blind model-assisted review and mechanical complete-page/count checks. Two pages, 40 unique messages, no repeated metadata reads. Known task cost USD 0.103674719; separate review USD 0.1644; no new unknown charges or transport failures. Historical unknown charges remain 26. Source links and wrapper receipts were included in this review.

C initially used Luna, but generated `await tools.call` in the synchronous guest. It failed before any leaf read, then Sol recovered and used saved receipts for a further deduplication check. C used five main-model turns and three program attempts. Cost improved 53.19% relative to A, but backend latency worsened 45.05%; the pilot failed. No unsupported async feature or weakened sandbox was added merely to accept that generated program.

B used Sol throughout, completed one program in three main-model turns, and improved cost 34.07% / backend latency 40.68% against A on this single task. This supports testing the existing deep chain for interpreter segments instead of assuming that a lower model tier is always more efficient. It is not evidence of general savings or a fresh holdout result.

Next: preserve this failed candidate; freeze a broader six-task, three-repeat local-read comparison with C fixed=quick, interpreter=deep, dynamic=deep. Use the original six smoke families and schedule, explicit v5 P10/P24 prompts, unchanged quality and cost/latency gates. Production defaults remain unchanged. Full 24-task and live external qualification remains outstanding.
