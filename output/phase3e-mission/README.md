# Phase 3E Leader-only durable mission completion

The owner-approved c58d57f contract adds an explicit fixed mission profile. A
narrow bridge binds the actual session Leader without requiring an own task,
then calls the existing core completion command once. Eligibility and independent
proof/recovered-chain rules stay in the unchanged core.

Known accepted receipts match actual command/completion projections. One final
text continuation verifies that exact completed-session state; it does not use
an active-session check or reopen admission. No further tool or run follows the
completion attempt. Known durable acceptance survives later failure/stop. Lost
replies and measured overruns remain uncertain without automatic retry, including
when local adapter cleanup is verified. Existing factories keep their validators.

TEST-PLAN.md documents the preflight, finite real-core cases and unchanged
operation limits. evidence.json/verification.json seal actual results; raw streams
and failed attempts stay local under .git. Check the seal from the repository root:
`rtk proxy python -X utf8 -B output/phase3e-mission/verify.py`

This is implementation evidence, not Phase3E exit acceptance. Core/mock-team
production is unchanged. Providers, complete team tools, generic/rejecting
adapters, authenticated transport, durable conversation recovery, UI, arbitrary
file/command effects, packaging and release remain unfinished.
