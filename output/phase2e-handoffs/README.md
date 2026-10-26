# Explicit recovery handoffs

27 October 2026. Implemented within the contract frozen atc84c709 following the
[delegated owner decision](../phase2e-approval/approval.json). The exact response
and bounded parent choice are retained; no explicit approval quote was invented.
Full Phase2E exit review remains pending. This is component qualification only.

Fresh schema7 adds STRICT handoffs(id,value) to schema6's exact tables. A bound
Leader can link one closed observed failed assignment to a fresh queued successor.
One event records decision/title/task/FIFO assignment/eight new held units/lineage.
No predecessor task, effect, claim, result, question or failure is rewritten.
Normal scheduler planning, new effect/attempt identity, approval and explicit result
remain necessary for successor execution. No automatic action or takeover follows.

Schema7 mission completion accepts covered failures only through accepted chains
ending in explicitly reported successful completed-effect tasks, with all root work
assigned/closed and no live questions/reserves/uncertainty. Failed records stay
failed. Uncovered/failed/cancelled/pending/unassigned work refuses success. Schemas5–6
retain their strict all-done predicate; schema1–6 openers remain separate without
migration/reset. Ten lifetime handoffs and100 assignments bound history.

Detached owner/Leader/source/target lineage queries exclude other members' private
question/failure/proof/ledger data. Titles and FIFO sequence derive from the accepted
handoff event. Exact retries precede capacity/state/recovery and append nothing.
Handoff gets no recovery-fence exemption and grants no approval. Stop preserves
lineage and cancels queued successors; completed sessions close all new admission.

All180 tests passed, retaining158 baseline tests and adding22 cases. Build, syntax
and import-boundary checks passed. Actual source/tests, compiled output, measured
Node26.7.0 Windows x64 ABI147 and installed native/dependency hashes were captured
before execution. Cases cover partial/successful chains, immutable histories,
privacy, FIFO,10/100 lifetime ceilings, old effect/attempt reuse refusal, stop/fence,
SQLite abort/tamper/replay injection, eight-versus-nine unit admission and recovered
completion at event1000, plus four before/after COMMIT handoff/completion crashes.
Independent witness counts prove no old resend. Raw TAP stays local under.git.

GPT-6 Luna max completed a supplied-module review with no concrete bug found. It
does not constitute a whole implementation audit. Flint40B Free and DeepSeek V4.1
Flash Free max timed out at60 seconds without verdicts. Reports list pre-existing
working-tree changes, not attributed delegate edits. Parent integration review and
source-bound direct execution govern acceptance. review.json retains safe digests.

No automatic retry/takeover/succession, live detector, provider/terminal/UI/network/
MCP action, hostile in-process isolation, whole-host/power-loss, throughput,
Electron/WSL ABI or release is qualified. Semantic duplication across distinct
explicitly approved effects is not deduplicated. Integration remains HOLD.

Verify: `rtk proxy python -X utf8 -B output/phase2e-handoffs/verify.py`.
