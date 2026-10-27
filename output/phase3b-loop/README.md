# Phase 3B offline loop implementation

The private api-loop package connects the explicit loop profile of the fixed
scripted adapter to a read-only core context capability. A valid tool turn and
independent local closure permit one bound profile read; the structured result
is submitted in a new request and validated/used by the scripted transport.
Conversation completion does not report a task or complete a mission.

Core/mock-team are unchanged. Legacy adapter behavior and all273 tests remain.
The loop enforces distinct member bindings, one active/two lifetime runs, three
requests/two reads per run, six requests per adapter, eight messages/32KiB history
and64KiB received conversation bytes. Stop fences owned pump steps and preserves
successful reads without continuation; unknown closure retains ownership.

TEST-PLAN.md defines the reviewed finite composition before first execution.
verification.json records actual checks/counts, evidence.json binds source and
artifacts, and verify.py checks history/approval/runtime/native/compiled hashes.
REVIEWS.md records requested model feedback and parent decisions. Raw streams
remain local. Phase3B exit is a separate review; provider/SDK/HTTP/credentials,
mutating tools, durable loop recovery, core task dispatch, UI and release remain HOLD.
