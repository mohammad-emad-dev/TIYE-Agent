# Offline API conversation loop

Private Phase3B composition: a fixed loop-enabled scripted adapter and a narrow
read-only core context bridge. `createCoreLoopScenario(store)` is a trusted
coordinator entry; its loop objects receive only active()/read() capabilities,
never raw store or role handles. The bridge alone reads existing schema7 metadata
and the bound member profile; it returns no task/permission/approval data.

Each run accepts closed version1/runId/text input. A complete valid tool turn and
independent local closure permit one get_my_context read. The structured result
is sent in a distinct continuation request and is validated/used by the fixed
transport. Response completion never completes a core task. Core data stays
unchanged by all reads/loop traffic. The trusted coordinator alone may stop it.

One active run/member, two lifetime runs, three requests/two tool reads per run,
six adapter requests, distinct member bindings and two loops per scenario are
bounded. IDs/attempts are reserved before calls, never refunded or automatically
retried. Closed message schemas, eight messages/32KiB history,64KiB received bytes,
64 retained events and16 observers constrain memory. Read/status checks are bounded
and measured; synchronous native calls cannot be preempted by JavaScript timers.

Owned advance steps run after adapter notification delivery. Context validation,
request reservation and send entry are synchronous. Coordinated core-stop/fence
can prevent begin from admission callbacks; already-created work remains dispatched
and uncertain when closure is unverified. Successful reads remain in local history
after stop.10-second request and5-second cleanup limits remain. Dispose the
scenario before closing the fixture store/root; unknown state is not cleared by
fixture cleanup. Transcript/ID tracking is in memory, not durable recovery.

The existing adapter factory still rejects tools and structured loop input. The
explicit new profile emits a separate response.tool_requested terminal event only
after validation. No provider/HTTP/key, arbitrary tool, mutating core command,
filesystem/command action, MCP, UI, release or authenticated hostile-code boundary
is implemented here. Qualification is under output/phase3b-loop/; exit is separate.

## Explicit reporting profile (Phase 3C)

createCoreReportingScenario(store) is a separate trusted entry that binds one
assigned task and member. Its report bridge alone captures member.report; the
loop prepares a canonical command with a private ID and reserves one attempt.
The core remains responsible for proof and result eligibility. A frozen receipt
enters the actual continuation request. Report state is exposed separately as
none/accepted/rejected/uncertain; a final text response cannot establish task
success. Exceptions and measured overruns fence the loop without resend, even
with verified transport cleanup. Known reports survive later conversation failure.

At most two tool attempts, one report and three requests per run; reports end
tool dispatch for that run. Other inherited bounds remain. Only fixed scripts
and the existing owned real-core witness fixtures are admitted. Provider and UI
integration are unfinished. See output/phase3c-report for implementation evidence;
the separate Phase3C exit review remains pending.

## Explicit question profile (Phase 3D)

createCoreQuestionScenario(store) binds one assigned member/task and derives
ask_leader or ask_user from the core role. The question bridge alone captures
ask and author-visible question readers. Known accepted asks block in the core
and keep occupancy; the loop waits with no request, timer or scheduled pump.
resume({version:1,resumeId,runId,questionId}) reads only the actual bound answer.
Open questions return still_waiting. Unique IDs/four reads prevent polling or
duplicate delivery. No model/subscriber input becomes an answer command.

After a real answer, a closed paired result enters one actual continuation.
Context/read/report tools share two attempts and three requests per run. Ask
reserves continuation capacity, report stays last, and proof requirements remain.
The question profile has ten controller checks; old profiles keep eight. Unknown
asks fence needs_attention even with verified transport cleanup. Stop/dispose
settles waiting runs and drains owned resume work before store/root cleanup.
Question state in outcomes is last observed knowledge, not inferred cancellation.
No durable conversation resume or UI cards are implemented. See
output/phase3d-question for bounded implementation evidence; exit is separate.

## Explicit mission profile (Phase 3E)

createCoreMissionScenario(store) binds the actual session Leader, without needing
an own assigned task. The narrow mission bridge alone captures completeMission.
One conversation may read context once and attempt completion once, with three
requests/two tools. A completion attempt is last; no retry or subsequent run.
Known accepted receipts authorize only one text continuation/final acceptance
under fresh exact completed-session validation. Other profiles keep active
checks. Core eligibility, proofs and recovered-chain rules remain authoritative.
An unknown write produces mission uncertainty even with verified local cleanup;
known acceptance survives conversation failure/stop. Receipt and conversation
outcome are separate. See output/phase3e-mission; the separate exit is pending.
