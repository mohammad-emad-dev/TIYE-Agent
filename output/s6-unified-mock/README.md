# Unified Windows/WSL mock protocol launcher

17 October 2026. This cohort implements the unified mock forwarding step from
the [launcher review](../launcher-admission-review/NEXT-STEP.md). Protocol bytes
now travel through the Windows client, WSL launcher and Linux managed service.
The ownership heartbeat uses a separate WSL process and pipe. Four development
tests pass; the frozen capture records the final results. Native execution stays
disabled, privacy/admission reviews remain open and Phase 1 remains HOLD.

## Executed path

```text
Independent Windows test → Windows watchdog → Job Object → Windows host
  │                                                   ├─ WSL lease bridge → lease.json
  │                                                   └─ Windows Handshake/observe
  │                                                        ↕ actual stdio bytes
  │                                                      WSL → systemd-run --pipe --wait
  │                                                               ↕ service stdio
  │                                                            Linux worker
  │                                                              ├─ protocol peer
  │                                                              └─ separate-session leaf
  └─ independent WSL observer: worker/peer/leaf pidfds + outside sentinel
```

The service command uses `--user --quiet --wait --pipe`, Type=exec,
ExitType=main and KillMode=control-group. Its Linux worker starts the lease
monitor, spawns the fixed Python peer with inherited service stdio, and owns its
wait/reap. The leaf has separate-session identity and default TERM behavior;
systemd removes it when main exits. No two components reap the same process:
Windows asyncio owns its WSL protocol client, Linux Popen owns the peer, and
the service manager owns the remaining service lifecycle.

The `--pipe`/`--wait` selection was checked against installed systemd help and
the [upstream v259 source documentation](https://raw.githubusercontent.com/systemd/systemd/v259/man/systemd-run.xml).
The independent query verifies the applied lifecycle properties. The prepared
service argv is also recorded in each Linux result. Source hashes cover the
Windows host, Unix entry, worker, protocol, heartbeat, framing and ownership helpers.

## Cases

| Case | Windows observation | Independent Linux observation |
| --- | --- | --- |
| Valid | Correlated response permits exactly one initialized notification; no protocol fault | Peer records the actual initialize object, exact notification and stdin EOF; worker reaps peer status 0 |
| Foreign response | Exact parser refusal for response ID 2; one locally drained write | Peer records EOF and no notification; protocol refusal remains separate from successful cleanup |
| Invalid UTF-8 | Exact parser refusal; original `ff 0a` bytes retained | Peer receives no notification and records EOF |
| Native flag | `--native` exits 2 before fixture execution | No Linux/native process launched by this refusal case |

All three wire cases require clean WSL protocol-client exit, both reader EOFs,
no cleanup errors or emergency signals, and successful lease-client exit. The
watchdog must finish by job-empty with root status 0; deadline termination cannot
pass. All three original Windows process handles are held after checking nonce
and creation time and must signal afterward.

The Linux observer opens all three pidfds before completion, rechecks start
ticks, actual UID/parent/session/cgroup and requires the original cgroup populated
while live. It releases the peer only after its receipt exists. Passing requires
all original pidfds signaled, original process entries absent, cgroup removed or
populated 0 and an unrelated held sentinel still live, before teardown. Peer
release is fixed fixture coordination, not an app-server message or a native
completion mechanism.

**Service garbage collection does not establish success.** The completed unit
may already be not-found when queried. That is recorded as terminal manager
properties unavailable, with no fabricated Result=success. A timed-out query
fails. Completion evidence is separately the `systemd-run --wait` client's exit
0, the worker's peer-reap record, peer receipt and independent lifecycle witnesses.
This cohort does not independently read a terminal unit Result after GC.

## Frozen budgets

| Boundary | Configuration |
| --- | --- |
| Windows outer watchdog | 90 s |
| Windows protocol observation | 75 s including its cleanup |
| WSL protocol spawn | 30 s awaited startup bound |
| Initialize work | 15 s |
| EOF / TERM / KILL waits | Up to 5 s each, inside protocol deadline |
| Service runtime backstop | 60 s from service startup |
| Service stop timeout | 5 s |
| Lease | Receipt expiry after 1 s, 100 ms sender interval |
| Independent cleanup observation | 15 s; worker lifetime must stay below 30 s |
| Retained streams | 4 MiB stdout and 1 MiB stderr |

These replace the eight-second component profile for this new source cohort.
The recorded worker-lifetime bound precedes the 60-second service backstop and
95-second leaf lifetime; fallback expiration cannot explain a pass. Constants
are a candidate profile, not vendor timing guarantees. The fast wire cases do
not exercise every startup/deadline boundary. Synchronous OS/filesystem operations
can exceed awaited limits; the outer supervisor is a separate backstop.

## Inspect and reproduce

From the project root, inspect saved hashes/results without starting WSL:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/unified-mock/run.py
```

`--develop` runs a fresh fixed mock cohort into `.git/tiye-unified-mock-development`.
`--capture` requires this report and review metadata and refuses an existing
input record. `--native` always refuses; no arbitrary binary option exists. The
saved future native executable path/digest is a reference to the earlier
installation record only and is not selected or executed.

[Input](input.json), [evidence](evidence.json), [observations](observations.json)
and [test log](tests.log) bind the capture. Per-case files preserve raw Windows
protocol stdout/stderr, observer stdout, empty expected diagnostics and Windows
configuration/identity records. Raw protocol fields are synthetic public data.
[Review provenance](review.json) records Codex assistance, GLM review and parent
dispositions separately. Historical measured source/evidence and the sealed
launcher review remain unchanged.

## Remaining work

This advances L1 with an executable mock path; it does not admit the native CLI.
Normal Stop, owner/transport loss, blocked writes and persistent uncertain-attempt
handling on this exact path are the next L2 step. The older owner-crash cohort
cannot substitute for those unified-path tests. P1 ambient access, P2 raw capture
permissions/publication and A1 source-bound admission remain open. Fresh Linux
environment/directories and a cgroup do not establish credential or network isolation.

Service query/control is non-atomic; hostile same-user file/cgroup changes,
buffered late heartbeats, suspend/resume, manager failure, concurrent instances,
reconnect and arbitrary provider trees remain unqualified. The Windows Job helper
inherits its launching environment; clearing the WSL/service environments is not
an ambient-access audit. No authentication, model, task or provider request was
performed by the fixture.
