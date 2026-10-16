# S6 live-survivor crash/restart mock — 16 October 2026

**The bounded recovery run passed.** A detached Linux supervisor and its one
child survived an intentional Electron main crash. A new Electron process read
the saved descriptor, verified both identities, blocked duplicate admission,
refused an altered identity, then signaled the verified supervisor through a
pidfd. Both original Linux PIDs were subsequently absent. **S6 remains partial;
Phase 1 construction remains on HOLD.**

This adds evidence for step 8 of the [nine-row assessment](../s6-assessment/README.md).
That assessment and the [earlier lifecycle capture](../s6-lifecycle/README.md)
remain historical records. The earlier capture exercised no live-survivor cleanup;
this separately named cohort exercises the positive signaling branch.

## Recorded observations

| Check | Observed result |
|---|---|
| Runtime | Electron 38.8.6, Electron Node 22.22.0; explicitly selected Ubuntu; non-root Linux UID 1000 |
| Intentional crash | Electron PID 15420 called `process.crash()` after persisting its descriptor; host observed exit code 4294930435, no timeout |
| Restart | New Electron PID 12056; same saved descriptor and Linux boot-ID hash |
| Live survivors | Supervisor PID 1854 and child PID 1855 verified twice after crash; both heartbeat counters grew |
| Duplicate admission | Existing verified identities returned `blocked-existing`, zero new launches |
| Mismatch controls | In-memory supervisor start ticks increased by one; admission and recovery returned `paused-unverified`, zero launches/signals; both real identities were still live afterward |
| Positive recovery | One `pidfd_send_signal(SIGTERM)` to supervisor PID 1854 after opening pidfds and revalidating both identities |
| Child shutdown | Supervisor terminated and reaped its own direct child; child exit 0; supervisor exit record reason `SIGTERM` |
| Final absence | Both original PIDs gone by Linux registry age 2.144 s; still gone at 2.575 s, heartbeats unchanged and boot hash unchanged |
| Attempts and limits | One fixture, one crash and one restart, zero retries/timeouts; host stages completed in 5.910 s; sources unchanged |

Linux ages are measured from the registry's Linux monotonic start. They are not
elapsed time since the Windows crash or cleanup signal. Cleanup occurred before
the 90-second supervisor and 95-second child self-expiry bounds; self-expiry was
not the observed exit mechanism. No replacement member was launched.

The crash stderr contains a Crashpad `not connected` diagnostic. It is retained
with the nonzero crash exit; no crash dump or debugger analysis is claimed.
Restart and all eleven WSL query stderr streams were empty. Host stdout contains
only blank lines. The result does not suppress or reinterpret the crash stderr.

## Protocol and ownership

The [protocol](../../feasibility/s6-wsl/recovery/protocol.json),
[Linux fixture/recovery helper](../../feasibility/s6-wsl/recovery/linux.py),
[Electron main](../../feasibility/s6-wsl/recovery/main.cjs),
[host coordinator](../../feasibility/s6-wsl/recovery/run.cjs) and
[offline checker](../../feasibility/s6-wsl/recovery/check.py) were saved and hashed
before the native launch. [Prelaunch metadata](prelaunch.json) freezes those
sources, the existing toolchain helper and installed Electron executable.

The bootstrap deliberately used `start_new_session=True`, closed standard I/O
and launched a supervisor in a fresh, marker-owned Ubuntu `/tmp` directory.
The supervisor created one ordinary child. It fsynced an atomic registry before
the bootstrap returned; Electron fsynced the host descriptor before crashing.
The [bootstrap output](crash-00-bootstrap.stdout.bin) includes exact public
registry text, its SHA-256 and the copied Linux fixture's hash. No power-loss
durability or secure credential-storage guarantee follows from these writes.

Linux identity is PID, `/proc` start ticks, UID, boot-ID hash and public nonce in
argv. Recovery opens pidfds for both recorded processes, then revalidates before
using the supervisor's pidfd. The supervisor owns its child through `Popen` and
reaps it directly. Recovery never signals by numeric PID, enumerates arbitrary
processes, kills a distribution or invokes `wsl --shutdown`.

The mismatch control changes expected start ticks only in memory. It reaches
the recovery pidfd/identity check and returns before signaling. Fresh observations
corroborate that the real supervisor and child remained live. The launch-admission
controls exercise this measurement helper's existing-descriptor decisions; they
do not implement a production engine, atomic cross-process launch lock or
concurrent recovery. The single initial launch record and inspected source support
the fixture's zero-replacement claim, not general containment of arbitrary spawns.

The coordinator allows 25 seconds per Electron stage, 70 seconds overall; each
WSL helper query has a ten-second deadline. No deadline path was exercised.
On host timeout it can terminate only its owned Electron handle; that alone
would not prove Linux cleanup. Mock TTLs are an emergency backstop, not a passing
cleanup criterion. The Linux fixture and owned Windows runtime/user-data roots
remain for inspection; no recursive deletion ran.

## Verification and remaining limits

[Coordinator evidence](coordinator.json) hashes the saved native artifacts and
records stage exits. [Crash evidence](crash.json) and [restart evidence](restart.json)
retain query results; each corresponding raw stdout/stderr file is preserved.
All measured sources and the selected Electron executable matched after the run.

From the repository root, verify the saved cohort without launching WSL,
Electron or a provider, and without sending a signal:

```powershell
rtk proxy python -X utf8 feasibility/s6-wsl/recovery/check.py
```

The checker passed. It checks source hashes and stored observations, including
raw query/result agreement, registry bytes, the two refusal controls, positive
signal, final absence and pre-expiry limits. It does not require the retained
temporary roots or the same installed Electron executable. The native coordinator
refuses the existing output directory; do not overwrite this capture to rerun it.

Intentional detachment makes this a controlled survivor scenario. It does not
establish natural survival behavior for provider CLIs, PTY/ConPTY workers or Job
Objects. Arbitrary descendants, concurrent launchers, actual PID reuse, zombies,
reboot/power loss, permission or malformed-proc faults, same-user registry attacks,
timeout cleanup and production crash recovery remain unqualified. No provider
request, package install, network configuration or shared OpenCode service change
was part of this native fixture.

Next: resolve an eligible Linux-native CLI route under S4 before installation or
provider-backed S6 terminal/worktree/tool checks. Keep the recorded consumer Agy
route excluded. S1–S5 status and all other S6 row limits remain unchanged; this
result clears neither full S6 nor the construction gate.

## Delegation

GPT-6 Luna max and Muse Spark 1.3 Free xhigh timed out without findings. The
authorized fallback Space Bunny Free xhigh failed with a provider invalid-request
error; DeepSeek V4.1 Flash Free max timed out without findings. None completed a
review or independently verified the workspace. Recursive event inspection is
recorded in [review metadata](review.json), along with artifact hashes and parent
verification. Gemini was not dispatched under the existing consumer-route exclusion.
The parent reviewed, ran and verified the fixture. Delegate availability failures
were not silently reported as successful reviews.
