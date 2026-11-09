# Phase 3H exit review

The approved fixed offline Leader failure-view contract passes its bounded exit
review. Production bytes remain identical to implementation `05765a2`;
`output/phase3h-failure/verification.json` and `evidence.json` seal the actual
qualification: three builds, four boundary checks, the 36-case focused suite and
the full 588-case suite, all at exit 0.

The explicit profile exposes the existing Leader-visible failure projection
through exactly one read-only `get_failures` tool. `get_failures` accepts only
`{}`; one conversation admits at most one read — one optional `get_my_context`
**or** one `get_failures` — and a valid tool after that read refuses before any
core access and fences uncertainty without retry. The bridge derives one
detached immutable result from one fresh replay-checked projection, validates
the bound active session and Leader, maps notices to roster `memberRef`s (raw
member UUIDs never appear), and refuses foreign binding, drift, malformed or
overflowing views without truncation. The loop receives no store, owner/member
handle, scheduler, effect plan, task creation, failure observation, handoff or
retry capability.

The qualification retains all 552 prior cases and adds 36 actual-core cases
(588 total). Defects corrected during the run and recorded in
[REVIEWS.md](../phase3h-failure/REVIEWS.md): two compile errors; the omitted
`failure-loop` event normalization that stalled the loop; the mixed-fixture
occupancy seeding; the read-uncertainty fencing for a valid tool after the
admitted read; and one test that had attributed a second failure read to the
context-only mode, contrary to the approved single-read contract.

Architecture 4.2 gains only the bounded `get_failures` read over the existing
projection. Architecture 4.7 gains visibility of already-recorded failure
notices, not detection, supervision, succession or remediation. Offline 5.1/5.3
remain fixed offline lifecycle and bounded in-memory scripted loops. Core and
mock-team production code, schema7 and historical evidence are unchanged.
Providers, native integration, generic/rejecting adapters, durable loop
recovery, full team tools, files/commands, UI, packaging and release remain
HOLD/unfinished.

This ends the Phase 3H construction exception and grants no new scope.
`decision.json` records bounded acceptance. From the repository root, verify
the sealed evidence with:

`rtk proxy python -X utf8 -B output/phase3h-failure/verify.py`
