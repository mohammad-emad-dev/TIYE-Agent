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
