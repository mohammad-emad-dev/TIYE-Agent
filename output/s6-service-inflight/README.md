# Linux cleanup during a live mock protocol

17 October 2026. This cohort exercises the next failure boundary after the
[managed protocol integration](../s6-service-transport/README.md): the Linux
worker dies or receives Stop while its protocol child is independently live.
Four controlled Ubuntu cases pass. Native provider admission remains disabled
and Phase 1 remains HOLD.

## Cases and observations

| Protocol stage at intervention | Action | Required terminal observation |
| --- | --- | --- |
| Initialize received; response deliberately withheld | SIGKILL through held worker pidfd | Same invocation Result=signal, main status 9 |
| Valid response sent; initialized notification received | SIGKILL through held worker pidfd | Same invocation Result=signal, main status 9 |
| Initialize received; response deliberately withheld | Identity-checked service Stop | Pre-reset same invocation Result=timeout, main status 9 |
| Valid response sent; initialized notification received | Identity-checked service Stop | Pre-reset same invocation Result=timeout, main status 9 |

Each unit contains a worker, a TERM-ignoring separate-session leaf, and a
TERM-ignoring protocol child in another session. The child publishes its live
stage only after checking the received initialize request and, for the second
stage, the exact initialized notification. Those received objects are preserved.
The pending fixture deliberately sends no response; this is fixture behavior,
not a claim that a native provider would remain silent.

The external test observer holds all three pidfds. It checks start ticks,
parentage, UID, nonce, session separation and cgroup membership. After querying
the original active service invocation it rechecks process identities and live
pidfds immediately before the action. Both the observer and an unrelated live
sentinel must be outside the unit's cgroup subtree.

Passing requires all three original pidfds signaled, original process entries
absent, and the original cgroup removed or populated 0 before teardown. The
sentinel must remain alive. Crash cases send no service Stop before these
observations. Explicit Stop records the terminal query before reset-failed can
discard its result. Terminal Id and InvocationID must match the launch descriptor.

**Process cleanup does not imply protocol completion.** The worker's final
protocol report must be absent before intervention and after cleanup. Results
are labelled `interrupted-unobserved`; no final transport-reap report or successful
exchange is invented after worker death. Peer receipt of initialized is a
separate observation from successful transport completion.

## Timing and the development race

Intervention must begin less than one second after a timestamp taken before unit
launch preparation; all cleanup observations must finish within three seconds of
that timestamp. These bounds precede the service's eight-second RuntimeMaxSec and
the leaf/peer's 15-second fallback, so those expirations cannot explain a pass.
These are test acceptance bounds, not hard OS latency guarantees.

The first development run exposed a competing cleanup path: with the inherited
0.3-second EOF/TERM grace, the initialized worker could complete its own transport
cleanup during Stop and write a report before systemd killed it. The
[failed-run diagnostic](development-failure.json) retains the failure log and
source hashes. It is an excerpt, not a public reproducible source snapshot.

The final fixed fixture uses a two-second grace for each EOF/TERM/KILL wait and
a 12-second transport deadline. Pending initialization has a five-second work
budget. The eight-second service runtime is an external backstop. The strict
intervention/cleanup bounds and absent worker report remain required. This
cohort isolates manager cleanup in that configuration; it does not qualify the
earlier short-grace race as successful cancellation or establish every possible
ordering between transport cleanup and service Stop.

## Reproduction and provenance

From the repository root, inspect saved evidence without launching WSL:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/service-inflight/run.py
```

`--develop` runs a new fixed mock capture into a private `.git` directory.
`--capture` requires this report and review metadata and refuses an existing
input record. The Windows runner selects Ubuntu explicitly and sends a bounded,
hash-verified seven-file source bundle through stdin. The Linux test timeout is
25 seconds; the WSL host timeout is 35 seconds. Runtime files use umask 077 and
are retained for inspection. No package installation, login, persistent service
configuration, network setting or provider binary is involved.

[Input](input.json), [evidence](evidence.json), [raw stdout](wsl.stdout.bin),
[raw stderr](wsl.stderr.bin) and [review dispositions](review.json) bind the capture.
The service helper, transport and pidfd ownership code are snapshots from the
prior cohort; earlier measured sources and evidence remain unchanged. Codex
supplied the initial fixed protocol peer. Parent corrections normalized its
identity fields and preserved received protocol objects. Muse was unavailable;
the authorized DeepSeek fallback supplied a design review. Exact review outcomes
and parent verification are recorded separately in the review metadata. A second
DeepSeek review found no blockers in the supplied worker, protocol peer, test and
offline validator. It explicitly assumed the separately verified helper/transport
contracts; this is not an independent whole-cohort review. Timing limits may
produce failures on a loaded host and do not establish production latency.

## Remaining boundary

This is ordinary fixed-tree lifecycle evidence on the recorded Ubuntu host.
It does not establish hostile same-user containment, cgroup escape prevention,
atomic query-and-control, manager failure behavior, concurrent unit replacement,
distribution shutdown or arbitrary provider trees. The stage markers and
fresh pipes are fixture-controlled; no native authentication/model/task behavior
is qualified. A worker killed during ownership cannot report its own final state.

The next integration step is to connect this live-child lifecycle to the Windows
supervisor and observe Windows-owner failure across WSL. Live cross-boundary
streaming, capture/privacy and ambient-access review remain before considering
unauthenticated native admission. Authenticated provider work also requires its
applicable eligibility. Product core construction remains on hold.
