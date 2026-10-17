# Windows owner failure across WSL

17 October 2026. This checkpoint connects the Windows Job Object supervisor to
the Linux service lifecycle using a bounded heartbeat lease. Two controlled mock
cases exercise Windows failure while the Linux protocol child is still live.
Native provider admission remains disabled and Phase 1 remains HOLD.

## Ownership and observation

```text
Independent Windows test controller
  ├─ independent wsl.exe → Linux observer holding three pidfds and a sentinel
  └─ Windows watchdog → Job Object
       └─ Windows mock owner → wsl.exe → Linux heartbeat bridge
                                        └─ receipt updates lease.json

Existing Linux user manager → transient service cgroup
  ├─ worker + lease monitor
  ├─ separate-session TERM-ignoring leaf
  └─ separate-session TERM-ignoring protocol child
```

The Windows owner writes nonce-bound, strictly increasing heartbeat sequences
every 100 ms through its owned WSL stdin pipe. The Linux bridge refreshes the
lease only upon receipt of a valid packet. EOF stops refresh; the bridge does
not stop the service. The worker monitor samples Linux monotonic timestamps and
exits with status 71 after the last receipt is more than one second old. It
records the expiry before using `os._exit`, so worker cleanup code cannot be
the mechanism that removes the remaining children. systemd then owns cgroup
cleanup with a 500 ms stop timeout. The service has an eight-second runtime
backstop; fixed leaf/protocol processes have 15-second fallback lifetimes.

The observer runs outside both the Windows Job Object and the service cgroup.
It starts the service after the first lease appears, holds all three Linux
pidfds, and verifies start ticks, nonce, parentage, session separation and cgroup
membership. The protocol peer has received initialize and deliberately withholds
its response. Before arming, the observer checks the active matching invocation,
all original instances still live, a fresh lease, and absent final protocol output.
The controller acts only after receiving the armed response.

## Cases

| Windows action | Independent requirements |
| --- | --- |
| Kill the watchdog process | Closing its Job Object removes the known Windows owner and WSL client; both original held Windows handles must signal. No normal watchdog report may appear |
| Kill the Windows owner through its held creation-time-checked handle | Pipe closure removes the WSL client; watchdog reports job-empty and preserves root exit status 77, rather than substituting success |

Both cases require the original three Linux pidfds signaled, original process
entries absent and original cgroup removed or populated 0 before observer
teardown. The unrelated sentinel must remain live. The terminal service name
and invocation must match; main exit 71 and unit Result=exit-code remain separate
from successful cleanup. The expiry record must match the nonce and main PID.
No final protocol report or protocol completion is invented after owner loss.

The observer must arm within two seconds of its pre-launch timestamp. Cleanup
must be observed within four seconds of arming and within six seconds of that
timestamp. The eight-second service runtime and 15-second fallback cannot explain
a passing result. These are host-specific acceptance limits, not hard OS timing
guarantees. The Windows watchdog's ten-second deadline is a failure backstop;
neither passing case relies on deadline termination.

**Windows handles and Linux pidfds prove different things.** The watchdog-crash
case cannot report Job Object accounting after its owner dies. It requires the
known Windows handles to signal and independently checks Linux cleanup. No claim
that Windows job emptiness implies Linux cleanup is made.

## Reproduction and evidence

From the repository root, inspect the saved capture without launching processes:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/cross-owner/run.py
```

`--develop` runs a new fixed cohort under `.git/tiye-cross-owner-development`.
`--capture` requires this report and review metadata, and refuses an existing
input record. The runner sends a bounded, hash-verified eight-file Linux bundle
through stdin to explicit Ubuntu UID 1000. The observer and bridge use allowlisted
environments and isolated Python startup. The copied Windows Job helper inherits
its launching process environment; this fixture does not qualify ambient credential
isolation. Runtime directories are private and retained for inspection. No login,
provider binary, installation, persistent service configuration or WSL shutdown
is involved.

[Input](input.json) and [evidence](evidence.json) bind all candidate sources and
saved artifacts. [Observations](observations.json) separate Windows and Linux
identities, runtime versions, lease expiry, terminal service status and cleanup
timing. [Test log](tests.log) and per-case raw observer/diagnostic files preserve
the capture. Windows configuration files contain only fixture paths and nonces.
[Review provenance](review.json) distinguishes delegated assistance, review scope
and parent verification. Earlier measured source/evidence cohorts remain unchanged.

## Limits and next step

This is a candidate lifecycle link for the tested ordinary process tree. It is
not a general distributed lease protocol or a security boundary. Buffered late
heartbeats, scheduler stalls, system suspend/resume, malicious same-user file
changes or lease refreshes, cgroup migration, manager failure and distribution
shutdown remain unqualified. Receipt timestamps use one Linux clock; Windows
and Linux monotonic timestamps are not compared. No stale-message or cross-clock
guarantee is inferred from the nonce and sequence checks.

The test does not exercise normal Windows Stop, live cross-boundary protocol
streaming, recovery/reconnect or concurrent instances. The original service's
query-then-control teardown is non-atomic and runs only after independent result
observations, or as failed-test cleanup. A lease expiry deliberately sacrifices
the worker's final protocol outcome; product recovery must reconcile that uncertainty.

Next is to consolidate the Windows/Linux launcher lifecycle and capture/privacy
requirements into an admission review. Any unauthenticated native run still needs
that reviewed admission. Authenticated provider work additionally needs its
applicable eligibility. The product core construction gate remains on hold.
