# S6 local process lifecycle observations — 16 October 2026

**Bounded result:** the graceful-stop case ended both mock processes. After
termination of the owned Windows WSL launcher in the second case, the supervisor
and child were already absent when inspected. Recovery therefore sent no signals.
Survivor-present cleanup remains **unqualified**.

| Case | Live proof before action | Outcome |
|---|---|---|
| Graceful | Both identities verified; root/child heartbeat counters grew | Nonce-bound stdin stop; launcher exit 0; both `/proc` identities absent by Linux registry age 0.87 s, still absent with stable heartbeat records at 1.23 s |
| Owned launcher termination | Both identities verified; counters grew; altered start-time control refused with zero signals; both still live afterward | Owned Windows `wsl.exe` handle terminated, exit 1; both Linux identities absent at first subsequent inspection, registry age 0.94 s; recovery `no-live-survivors`, zero signals; stable absence/heartbeats at 1.64 s |

These ages use the Linux monotonic clock relative to the fixture's recorded
Linux start, not time elapsed since the Windows action. No Windows/Linux clock
timestamps are subtracted. The observations finished well before the fixture's
45-second supervisor and 50-second child self-expiry limits. The cause of their
disappearance after launcher termination was not isolated; no Job Object or
general WSL-tree termination mechanism is inferred.

## Fixture and identity contract

The [protocol](../../feasibility/s6-wsl/lifecycle/protocol.json),
[Windows coordinator](../../feasibility/s6-wsl/lifecycle/run.py) and
[Linux fixture/helper](../../feasibility/s6-wsl/lifecycle/linux.py) were frozen
before launch. Each case used a fresh Linux `/tmp` directory containing a public
nonce marker, atomically replaced heartbeat files and an atomically written
registry. The registry file and directory were fsynced before READY. Subsequent
helper calls checked its SHA-256 and owner marker. The two registry identities
were PID, `/proc/<pid>/stat` start ticks, UID and Linux boot-ID hash, with the
public nonce also checked in live process argv. The stat parser splits after
the last closing parenthesis before selecting field 22.

The supervisor owns one ordinary Python child; it stops/reaps that child before
a successful graceful exit. The mock's stdin-EOF policy is to record EOF and wait
for a signal or deadline. That configured policy is not a claim about real CLIs.
The fixture runs non-root, without a PTY, real provider or external command task.

The negative control changes expected supervisor start ticks **in memory**. It
opened a pidfd, then refused the mismatched identity before signaling anything.
The on-disk registry was not changed. A fresh inspection still verified both live
processes after the refusal. This tests one mismatch path, not malicious-registry
resistance, actual PID reuse or every `/proc` failure condition.

The recovery implementation can admit surviving identities after pidfd opening
and revalidation, then use `pidfd_send_signal`. Its positive signaling path was
**not executed**: both processes were already gone. Zombie states are represented
separately and cannot satisfy the final absence gate, but no zombie or permission/
malformed-proc fault case was observed here. The script is frozen measurement
code, not a production recovery adapter or comprehensive fail-closed proof.

## Execution and evidence

There was one attempt per case and no relaunch of a member after uncertainty.
The coordinator has a 120-second deadline, 12-second helper-query limits and
bounded waits for READY and launcher exit; final absence polling is bounded to
five seconds. A second observation checks heartbeat stability after a short wait.
No timeout, emergency launcher termination or fixture self-expiry was used.

The Windows abnormal action targeted only the coordinator's owned `Popen`
handle. Recovery issued no Linux signals; graceful shutdown used the supervisor's
owned direct-child `Popen` object. No PID-only recovery cleanup or unrelated
process targeting occurred, and neither `wsl --shutdown` nor distribution
termination was used.
Both local fixture roots remain for inspection; no recursive root deletion ran.

[Evidence](evidence.json) retains READY/registry data, expected and observed
identities, heartbeat observations, child-query outcomes, raw public stdout/stderr
hashes, launcher exit codes and source hashes. Launcher stream readers joined;
their retained stderr streams are empty. All measured sources matched after exit.
The nonce and boot-ID hash are diagnostic fixture identity values, not credentials.

Verify the saved observation without running or signaling any process:

```powershell
rtk proxy python -X utf8 feasibility/s6-wsl/lifecycle/check.py
```

Checker success verifies the recorded bounded outcome, including the absence
of a cleanup signal. It does not qualify a survivor cleanup path or full S6.
The native launcher refuses its existing evidence directory. Preserve the
cohort rather than regenerating it in place.

## Architecture consequence and next step

Retain durable ownership identity and inspect before any relaunch. A no-survivor
observation permits no conclusion that surviving Linux descendants can always
be cleaned safely. Do not replace Linux identity/recovery checks with Windows
launcher exit status alone. Survivor-present cleanup and duplicate-launch
refusal under actual recovery remain separate qualification work.

Next is WSL mock PTY integration with the same ownership requirements. Actual
Electron main crashes, power loss, Job Object behavior, provider trees, process
races, Linux reboots and full S6 remain unqualified. This fixture does not clear
Phase 1 construction.

## Review

Muse Spark 1.3 Free xhigh, Space Bunny Free xhigh and DeepSeek V4.1 Flash Free
max completed supplied-context reviews before execution. No reviewer inspected
the workspace or verified the native results; structured streams contain zero
tool events. The parent implemented, observed and checked the capture. See
[review metadata](review.json). The previously unsupported exact Codex model
and excluded consumer Agy route were not dispatched.

Retained review points: robust stat field parsing, identity revalidation,
separate zombie/gone states, explicit self-expiry bounds and no automatic duplicate
launch. No claim about a tested fd-relative `/proc` traversal or positive pidfd
signaling is made; only mismatch refusal and the no-live-survivor recovery branch
ran. All recovery guarantees remain limited to the observed paths.
