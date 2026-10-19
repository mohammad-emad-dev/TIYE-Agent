# Shared deadline coordinator and unknown-outcome recovery policy

19 October 2026

Implemented a nonexecuting coordinator around the frozen native phase schedule.
It consumes the sealed charged-WSL public witness format for compatibility tests.
This is the policy layer for the next runtime composition; it launches no process,
opens no account and makes no provider or model request. Historical sources and
evidence remain unchanged.

**Native execution remains disabled.** L1/L2 are PARTIAL, P1/P2 OPEN,
A1 BLOCKED and Phase 1 HOLD. There is no new live cross-OS deadline qualification
or durable recovery implementation in this cohort.

## Implemented behavior

`Coordinator` uses one supplied monotonic origin and the existing `NativeSchedule`.
Host start, child start and initialize have 30/15/15-second phase caps clipped to
origin + 60 seconds. The first EOF transition fixes the cleanup cutoff at the
earlier of EOF entry + 15 seconds or origin + 75 seconds. TERM/KILL follow in
order, each with up to five seconds remaining. Observation has up to 15 seconds
clipped to origin + 90 seconds. Early cleanup need not wait until +75 or +90.
Delayed entry can leave no allowance; it never restores lost work time.

Work at or after a phase cutoff is refused. Invalid transitions leave the frozen
schedule unchanged. A phase can dispatch only one operation. The operation's
absolute cutoff is captured before dispatch so cleanup preemption cannot extend
its wait or earn work completion credit under a later phase.

`perform` uses `asyncio.wait`, without automatic cancellation or cancellation
grace. A timeout or caller cancellation retains the task in the coordinator's
owned pending set. Caller cancellation and operation errors propagate after
marking the outcome unknown. `reap_settled` consumes late exceptions, records
failure and removes only finished tasks. The caller must retain the coordinator
and external ownership handles until all work is settled. Dropping the object or
stopping the event loop is not a qualified shutdown path.

Unknown is sticky for the run. Cleanup may proceed, and later cleanup can be
recorded separately, but it cannot turn an unknown run into success or permit
automatic retry. Cleanup acceptance requires observation time remaining, no
unsettled operation and the full closed witness schema. A timely operation's
return value is not validated protocol success. No provider protocol parser is
implemented here.

## Windows/Linux witness boundary

The compatibility tests read the three selected observations in
[the previous cohort](../s6-charged-wsl/observations.json), bound by this cohort's
reference hashes. They do not rerun those cases or import their old timings into
the new schedule. Held Windows process signals, a positive Job-empty report,
Linux pidfd signals, empty cgroup, surviving unrelated sentinel and a valid
lease verdict must all be present. Boolean verdicts are checked strictly; 1 is
not accepted as true. Extra fields are refused.

Guardian loss has no Job-empty report. It therefore remains insufficient for
this stronger whole-group cleanup mapping, even though the earlier fixed-fixture
case passed its original narrower criteria. The original report remains intact.
The sentinel is outside the owned groups; its survival is collateral-process
evidence. Selected JSON verdicts are not live identity attestations. This API has
no authority to stop any process or grant launch admission.

## Recovery rule

`recovery_disposition` defines restart as unknown with evidence/ownership
retention required. Automatic retry, deletion, PID-only termination and native
launch are forbidden. This is an executable refusal policy, not a journal,
restart discovery tool, retained-handle serializer or identity registry.

The future recovery adapter must reserve a new attempt identity durably, reject
stale records, inspect protected original ownership records and verify exact
Windows creation identities and Linux unit invocation/cgroup identities before
any action. Missing or corrupt identity records require manual review. Existing
uncertain files must be retained. A fresh nonce alone cannot authorize a retry
of an unresolved attempt. No recovery action is performed by these tests.

## Verification and limits

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/deadline-recovery/run.py --test
rtk proxy python -B -O -X utf8 feasibility/s6-wsl/deadline-recovery/run.py --test
rtk proxy python -B -X utf8 feasibility/s6-wsl/deadline-recovery/run.py
```

Twelve coordinator tests and two publication tests pass in normal and optimized
Windows Python modes. They cover clipped phase caps, expired dispatch refusal,
late completion, caller cancellation with retained live task, late exception
consumption, failure/redispatch refusal, invalid transitions, clock regression,
strict witness mapping, restart refusal, real asyncio wait timeout, cleanup
preemption and timely completion. Tests use real asyncio tasks and an injected
boundary clock; they launch no Windows Job or Linux service.

The injected clock computes schedule boundaries; `asyncio.wait` waits a duration
using the event loop's own clock. It does not share or virtualize that clock.
Tests advance the injected clock explicitly around events and use one real short
wait timeout. These results do not prove OS deadline enforcement, suspend/resume
behavior, blocked synchronous calls, cleanup under disk failure or survival of
collector loss. Operation factories must be nonblocking and return coroutines;
the coordinator cannot revoke side effects inside an arbitrary coroutine.

[Observations](observations.json) and [source manifest](evidence.json) describe
only this scope. Hashes check local consistency, not independent attestation.
The previous charged-WSL offline checker and native policy/contract checkers were
also rerun. Luna and GLM supplied design reviews without tools or edits, not
final-code audits. [Review decisions](review.json) record adopted findings and
remaining work. Gemini remains excluded by the prior consumer-route decision;
fallback was unnecessary.

**Next:** wire this coordinator into a new synthetic Windows/Ubuntu composition
with actual adapters, charged control records and independent ownership witnesses.
Qualify timeout/unknown spawn and collector loss there. Then finish the native
effective configuration/helper inventory and separate U0 admission. No existing
five-second watchdog is reclassified as a native 60/75/90-second implementation.
