# Unified launcher interruption and replay fence

17 October 2026. This mock-only cohort extends the
[unified forwarding path](../s6-unified-mock/README.md) with three controlled
interruptions and a conservative local attempt journal. Native execution remains
disabled and Phase 1 remains HOLD. This advances part of L2; blocked writes,
privacy and source-bound native admission remain open.

## What runs

The Windows Job supervisor contains a host and separate WSL protocol and
heartbeat clients. The protocol still crosses `systemd-run --user --quiet --wait
--pipe` into a Type=exec, ExitType=main, KillMode=control-group service. The main
worker monitors its nonce-bound lease and owns a fixed Python peer plus a
separate-session leaf. An independent WSL observer outside the Job and service
cgroup holds all three Linux pidfds and an unrelated sentinel.

Before any intervention the observer checks live process identities, parentage,
sessions, populated cgroup, unit InvocationID and applied service properties.
The Windows coordinator holds creation-time-checked handles for the host and
both WSL clients and waits for that observer barrier. No timing-only sleep
selects the injection point.

| Case | Intervention | Required evidence |
| --- | --- | --- |
| Stop pending | Nonce-bound Stop request after peer receives initialize but before it responds | Protocol outcome `normal-stop`; one write and no response/notification; separate identity-bound systemctl Stop; no lease-expiry record |
| Owner loss | Terminate held Windows host handle with status 77 after peer receives initialized | Supervisor observes owner exit and terminates remaining Job members; Linux main records lease expiry; no fabricated host completion report |
| Transport loss | Terminate only the held WSL protocol-client handle with status 77 after initialized | Host records `transport-ended`, retires heartbeat and reaps its direct client; Linux main records lease expiry |
| Partial journal | Start fresh host processes with empty and malformed existing records | Exit 23 before any WSL launch; original bytes and directory contents unchanged |
| Native flag | Invoke `--native` | Exit 2 with native-execution refusal before fixture execution |
| Stop callback failure | Local Windows regression child with a deliberately failing cleanup callback | Error retained, stdin still closed, child echoes the actual input on EOF and is reaped without emergency signals |

Each interruption also starts a fresh host process with the original config and
attempt file. It must exit 23 with `attempt-already-recorded` and leave the
journal byte-identical. These are six unittest tests, including two partial-file
subcases and three restart checks. The callback regression uses a separate local
15 s envelope with 5 s spawn, 2 s work and 2 s cleanup phases; it does not qualify
the WSL profile's deadline boundaries.

Passing cleanup requires all original Linux pidfds signaled, original `/proc`
entries absent, original cgroup empty or removed, and the unrelated sentinel
still live **before teardown**. All three known Windows handles must signal and
Job accounting must empty without the watchdog deadline. Protocol cancellation
or failure is separate from successful cleanup. Explicit systemd Stop can return
client status 0 while the host still records cancellation; transport termination
returns 77. A locally drained write never establishes peer delivery.

A Stop callback failure cannot bypass the direct-client close/wait path. Known
control failures are recorded as cleanup errors and prevent a successful host
exit. Heartbeat cleanup records timeout/failure and attempts bounded termination
and reap. Raw Stop response bytes are saved separately; the parsed Stop result
is published only after return code, nonce and shape checks.

If systemd has garbage-collected the unit, terminal manager properties are
recorded as unavailable. The default values returned for a not-found unit are
not evidence of Result=success. Positive process and cgroup witnesses establish
only the measured cleanup outcome.

## Attempt fence and limits

The host exclusively creates `attempt.json` before launching clients. The record
includes nonce, host-source SHA-256, `reserved` state and `delivery: unknown`.
Immediately before the first actual initialize write it replaces that record
with an fsynced `attempted` record. It never changes delivery to success. An
existing record of any content refuses another reservation before launch.

This tests process restart on the same local path with one owner. It does not
establish power-loss durability of directory entries or rename, concurrent writer
serialization, hostile filesystem safety, a production database, reconnect or
replay authorization. Deleting or changing the attempt path defeats this local
fence; the product's stable attempt identity and recovery workflow are still to
be implemented. Reserved attempts are also refused conservatively.

## Budgets and scope

The profile retains a 90 s outer Windows watchdog, 75 s protocol envelope,
30 s awaited spawn bound, 15 s initialize bound, 5 s cleanup phases, 60 s service
runtime backstop, 5 s service stop timeout and 1 s receipt lease with a 100 ms
sender interval. Independent cleanup has 15 s to observe death and the worker's
observed lifetime must stay below 30 s. Thus the 60 s runtime or the peer/leaf
95 s lifetime cannot account for a passing interruption. These constants are
fixture bounds, not provider performance guarantees.

The peer deliberately stays alive after its recorded protocol phase instead of
exiting on EOF. This prevents a cooperative EOF exit from standing in for the
lease or Stop mechanism. The normal Stop control uses the separately recorded
descriptor and rechecks unit identity before control. Query/control remains
non-atomic and assumes a non-hostile same-user fixture.

Blocked/partially drained writes, Stop racing a response, initialization during
startup failure, heartbeat scheduling delays, suspend/resume, manager failure,
concurrent instances, arbitrary provider trees and hostile same-user behavior
remain unqualified. Full L2 is not closed. P1 ambient credential/filesystem/socket/
network access, P2 effective capture permissions/publication and A1 admission
remain open. Clearing service environment variables and owning a cgroup are not
an isolation audit. No authentication or provider model request occurs in these
fixtures. Delegated development assistance is recorded separately.

## Inspect or reproduce

From the project root, verify saved hashes and verdicts without starting WSL:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/unified-lifecycle/run.py
```

`--develop` runs a fresh private cohort under `.git/tiye-unified-lifecycle-development`.
`--capture` requires this report and review metadata and refuses existing input.
`--native` always refuses. The installed native binary path/digest in input is
an unexecuted future reference only.

[Input](input.json), [evidence](evidence.json), [observations](observations.json),
[tests](tests.log) and [review provenance](review.json) bind this capture. Saved
per-case files include synthetic protocol bytes, observer records, attempt files,
Stop control results and Windows identity/accounting records. Existing measured
cohorts and the historical sealed launcher review remain unchanged.

Next: blocked/uncertain writes and persistent refusal at that exact boundary,
then review the remaining L1/L2 requirements against the final artifact.
