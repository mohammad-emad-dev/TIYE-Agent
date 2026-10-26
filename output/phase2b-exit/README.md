# Phase 2B exit review

26 October 2026. This review closes the approved internal durable-question slice
against the contract frozen at2766d76 and activated at e62cea3. See MATRIX.md for
the requirement mapping and decision.json for the machine-readable verdict.

Production code remains unchanged from e62cea3. Two real SQLite boundary tests
close explicit evidence gaps: schema4 stop at event1000 after answered history and
stored question-command hash corruption refusing reopen without repair.
The complete reviewed suite, source/native/runtime binding and counts are captured
in preflight.json and verification.json. Raw captures remain local under .git.
Historical evidence is verified against its qualifying Git revision rather than
rewritten for the new test inventory. The earlier240-second incomplete component
capture remains inconclusive; its later complete123-test run stays recorded.

GPT-6 Luna max completed a supplied-module review with no concrete bug, explicitly
excluding surrounding call sites. Flint40B Free and DeepSeek V4.1 Flash Free max
timed out at60 seconds with no verdict. All three reported no touched files.
These outcomes are advisory; parent review covers API and replay integration,
stop order, recovery fence, budgets, tests and actual direct execution.

No new product capability is authorized by this exit. Next is a bounded proposal
for the next Architecture4 behavior and its scope decision before construction.
UI, provider transport, automatic worker execution and release are still deferred.
Fresh schema4 only, trusted coordinator roles, controlled owned-child crashes and
fixed synthetic witnesses define the acceptance boundary. No throughput claim.

Verify with `rtk proxy python -X utf8 -B output/phase2b-exit/verify.py`.
