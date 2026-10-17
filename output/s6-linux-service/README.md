# Linux transient-service lifecycle boundary

17 October 2026. This cohort tests a service-manager boundary for TIYE's Linux
launcher. A per-user systemd transient service owns the fixed workload and its
separate-session child. Four controlled Ubuntu cases passed during development;
the frozen capture and offline checker record the final results. Native provider
admission remains disabled and Phase 1 remains HOLD.

## Why this step matters

The earlier [Linux owner](../s6-linux-owner/README.md) and
[active Stop](../s6-linux-stop/README.md) components require their supervisor to
remain alive. This candidate puts the Linux workload lifecycle under the existing
user service manager, so cleanup of ordinary descendants can continue after the
service main process dies. It does not rely on a failed main process executing
its own `finally` block.

The installed manager is systemd 259.5 on the recorded Ubuntu host. The
[`service.py` helper](../../feasibility/s6-wsl/linux-service/service.py) creates
only uniquely named `tiye-service-<nonce>.service` transient units. It sets and
observes `ExitType=main`, `KillMode=control-group`, `SendSIGKILL=yes`, `Restart=no`,
`Delegate=no`, `UMask=0077`, a 500 ms stop timeout and a two- or eight-second
runtime limit. Failed units are observed before scoped reset/cleanup.

The configuration follows upstream v259 documentation for
[cgroup cleanup](https://raw.githubusercontent.com/systemd/systemd/v259/man/systemd.kill.xml),
[main-process and runtime lifecycle](https://raw.githubusercontent.com/systemd/systemd/v259/man/systemd.service.xml)
and [transient unit launch](https://raw.githubusercontent.com/systemd/systemd/v259/man/systemd-run.xml).
The recorded runtime version includes Ubuntu patches; the tests establish this
host's behavior rather than assuming every v259 installation is identical.

## Four cases and independent witnesses

| Case | Observation required before test teardown |
| --- | --- |
| Normal main exit | Main exits 0 on a public release marker; systemd removes its TERM-ignoring child despite the child's separate session |
| Main crash | Observer sends SIGKILL through the held main pidfd; manager removes the remaining child, preserving unit `Result=signal` and main status 9 |
| Runtime expiry | Manager's configured two-second runtime expires; main and child are removed, with unit `Result=timeout` |
| Invocation mismatch | Well-formed incorrect invocation ID refuses Stop; both original pidfds remain live; the real descriptor then permits scoped Stop |

Every case holds independent main/child pidfds and checks PID start ticks and
the public nonce before intervention. Both processes must report membership in
the descriptor's cgroup while live; the child must have a separate session.
Afterward both original `/proc` entries must be absent, both held pidfds signaled,
and the original cgroup either removed or `populated 0`. An unrelated sibling
sentinel outside the unit remains live. Failed service cleanup happens only
after these observations, not as the mechanism used to pass crash/expiry cases.

**Task exit and cleanup status stay separate.** In the normal-main-exit case,
systemd records main status 0 but unit `Result=timeout`, because its child ignores
TERM and requires stop-timeout escalation. That expected failure status is
preserved; successful process cleanup does not relabel the unit as successful.
The explicit-Stop receipt also preserves the post-stop query before reset.

Fixture processes have a 15-second fallback lifetime. Cleanup must be observed
within five seconds of the test action; fallback expiry is not accepted evidence.
Runtime expiry is measured after readiness, so that interval is not the service's
exact total lifetime. These observations are not hard OS latency guarantees.

## Identity and control limits

Before control, the helper checks the exact unit name, invocation ID and cgroup.
An inactive/failed unit with MainPID 0 may legitimately have an empty cgroup path;
its invocation and name must still match before reset. Unknown or timed-out
queries do not establish absence. No other unit is stopped or reset by this fixture.

Query-then-control is not an atomic compare-and-stop operation. Concurrent unit
replacement, hostile same-user service control or cgroup migration, service-
mediated launches outside the unit, manager death, reboot and distribution shutdown
remain unqualified. This is a lifecycle boundary for the tested ordinary process
tree, not filesystem, network or credential isolation. Actual Windows-owner crash
and the native U0 protocol have not been exercised through this service candidate.

## Reproduce and inspect

From the project root, verify saved artifacts only:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/linux-service/run.py
```

The default starts no WSL process and sends no service control request. `--develop`
runs a new fixed mock cohort with private `.git` evidence. `--capture` requires
this README and `review.json` and refuses an existing input record. The host selects
Ubuntu explicitly and supplies a hash-verified three-file bundle through stdin.
Bootstrap directories are mode 0700 under umask 077 and retained for inspection.
Fixture environments are explicit allowlists; user-manager queries use only the
existing UID-1000 bus. No provider, account login, package installation, persistent
service configuration, network setting, reboot, broad unit control or recursive
deletion is part of the capture.

The [input](input.json) freezes hashes, argv and bounds. [Raw stdout](wsl.stdout.bin)
contains the versioned bootstrap envelope and encoded test observations;
[stderr](wsl.stderr.bin) is separate. [Evidence](evidence.json) binds artifacts and
host results. [Review provenance](review.json) separates delegate outcomes from
parent verification. A host timeout is a failed capture and cannot prove Linux
cleanup; Linux test timeout is 25 seconds and WSL host timeout is 35 seconds.

Codex supplied the initial helper source. Muse was unavailable; the authorized
DeepSeek fallback exited without review text. The parent reviewed the final code
and tested it. No independent completed code review is claimed.

This establishes a candidate manager-backed lifecycle route for the next native
host/Linux integration. Capture/privacy review and the actual U0 wire observation
remain before unauthenticated admission. Authenticated work still requires its
applicable provider route. S4/S6 and product construction remain unapproved.
