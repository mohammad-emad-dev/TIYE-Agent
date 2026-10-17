# Unified launcher: synthetic pending writes

17 October 2026. This cohort extends the
[interruption launcher](../s6-unified-lifecycle/README.md) with measured pending
drains and a persisted third-write attempt. All execution is mock-only. Native
execution remains disabled and Phase 1 remains HOLD.

## Scope of the pressure test

After the real initialize/initialized exchange crosses Windows, WSL and
`systemd-run --pipe --wait`, the fixed Linux peer records its actual messages and
stops reading stdin for 95 seconds. The Windows host then attempts an **8 MiB
synthetic byte sequence**. This bypasses the native request encoder deliberately:
the native-profile input encoder still rejects records larger than 16 KiB.

This measures local transport queue pressure and cancellation/error handling.
It does not qualify native frame capacity, kernel pipe capacity, sustained
throughput, provider request delivery or an authenticated workflow. In particular,
the buffer counter is a Windows asyncio transport counter, not a measurement of
bytes received or parsed by the Linux peer.

Before writing, the host fsyncs a journal update containing third-write sequence,
byte count, attempted state and unknown delivery. It then starts the actual
`drain()` task. Two scheduler yields collect samples only after that task has
started; both must show the task still pending and buffer bytes above the actual
high watermark. Watermark order was checked against the installed Python
implementation: the API returns `(low, high)`.

The scheduler yields are not timing proof. Task state and measured queue counters
are the pressure evidence. Samples are adjacent scheduler observations, not a
duration or throughput claim. The two small handshake writes also record queue
sizes and must finish locally drained without exceeding their high watermark.

The coordinator waits for the pressure witness, the independent Linux observer's
live pidfd/cgroup/sentinel barrier, and held Windows process identities before
intervening. The witness establishes pending state at its observation barrier;
it is not an atomic sample at the later external kill instruction.

## Cases and results

| Case | Required write outcome | Cleanup mechanism |
| --- | --- | --- |
| Stop while third drain is pending | `normal-stop`, third write `uncertain-write-cancelled`; separate control task observes Stop before cancellation outcome | Discard queued local input and request identity-bound service Stop |
| Owner loss after pressure witness | No fabricated dead-host report; persisted third-write attempt stays unknown | Windows supervisor terminates remaining Job clients; Linux lease expires |
| Protocol-client loss after pressure witness | Actual `write-failed` or `transport-ended`; third write uncertain or uncertain/cancelled | Host retires heartbeat; Linux lease expires |
| Empty/malformed existing journal | Fresh host refuses with status 23 before any launch | Existing bytes and directory contents unchanged |
| Native flag | Status 2 before fixture launch | Native execution refused |
| Stop callback failure regression | Error retained while actual local child receives EOF, echoes input and is reaped | Direct cleanup runs despite callback failure |

These are six unittest tests. Each of the three pressure cases also starts a
fresh host process against the original config and journal. It must refuse with
status 23 and leave the journal byte-identical. No uncertain attempt is replayed.
The journal's delivery fields remain unknown even when early writes drain.

The Stop poll runs in a separate asyncio task from the blocked writer. That
control task can cancel the writer while its real drain is suspended. The drain
task is canceled/awaited on exit. A live host reports unexpected drain completion
as a failure, not a pressure pass. The active host aborts its local stdin
transport before service cleanup to discard queued bytes; an abort request alone
does not establish process death.

After injected transport loss, `wait_closed()` can report BrokenPipeError or
ConnectionResetError from the same failed write. The report retains this as a
separate peer-close error only when the write is uncertain, the direct client
has exited, both readers reached EOF, and the transport is closing with zero
buffered bytes. Other close failures remain cleanup errors and reject the run.
This is successful accounting for a failed transport, not successful delivery.

## Independent witnesses and bounds

The path retains the Windows Job supervisor, separate ownership heartbeat,
Type=exec/ExitType=main/KillMode=control-group service, worker, peer and
separate-session leaf. The independent WSL observer is outside the Job and
service cgroup. It verifies nonce, UID, start ticks, parent/session/cgroup,
unit InvocationID and applied policy before intervention, holding original pidfds.

Passing requires those original Linux processes dead, original `/proc` entries
absent, original cgroup empty or removed, and an unrelated sentinel still live
before teardown. All three original held Windows handles must signal and Job
accounting must empty without the watchdog deadline. Unit garbage collection
means terminal manager metadata unavailable; it is never Result=success evidence.

The WSL profile remains watchdog 90 s, protocol 75 s, spawn 30 s, initialize/work
15 s, cleanup phases 5 s, service runtime 60 s, service stop 5 s and receipt lease
1 s with 100 ms sender interval. Independent cleanup must finish within 15 s and
the worker's observed lifetime must stay below 30 s. Service/peer/leaf expiration
cannot explain a passing result. The local callback regression retains its
separate 15/5/2/2-second envelope. Deadline-boundary coverage is not claimed.

## Limits and next step

This completes the synthetic pending-write substep, not full L2 or native
admission. The fence is single-owner, local-path, process-restart protection.
Deleting/changing its path, power loss, directory-entry durability, concurrent
writers, hostile same-user filesystem changes and a product recovery database
remain outside its guarantee. Raw partial delivery and byte offsets are unknown.

Small native frames under independently constrained real pipe conditions, Stop
racing responses, startup failures, manager failure, suspend/resume, buffered late
heartbeats, concurrent instances and arbitrary provider trees remain unqualified.
P1 ambient credential/filesystem/socket/network review, P2 effective capture
permissions/publication and A1 source-bound admission remain open. Environment
allowlists and a cgroup do not establish isolation. No provider authentication,
model or task request occurs in the fixtures; delegated assistance is separate.

Next: review the accumulated L1/L2 evidence against the final launcher artifact
and identify the remaining admission requirements before any native run.

## Inspect or reproduce

From the project root, inspect the saved capture without launching WSL:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/unified-write-pressure/run.py
```

`--develop` creates a new private cohort under `.git/tiye-unified-write-pressure-development`.
`--capture` requires this report and review metadata and refuses an existing
input record. `--native` always refuses. The saved future native binary digest
is an unexecuted installation reference.

[Input](input.json), [evidence](evidence.json), [observations](observations.json),
[tests](tests.log) and [review provenance](review.json) bind the capture. Per-case
files retain synthetic handshake bytes, pressure witnesses, journal, control and
identity/accounting records. The 8 MiB pressure payload is generated in memory
and is not published as a bulk artifact. Historical measured cohorts are unchanged.
