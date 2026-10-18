# Consolidated mock launcher

18 October 2026. This cohort implements the
[single-source regression brief](../launcher-evidence-review/NEXT-STEP.md).
The forwarding, rejection, lifecycle and synthetic pressure scenarios now run
on one source tree and profile. Native execution remains disabled and Phase 1
remains HOLD. This is mock qualification, not native admission.

## One implementation across the matrix

All nine service scenarios use the same Windows host, transport/framing,
watchdog/Job helper, WSL entry, Linux worker, lease, service control, peer and
independent observer files. A fixed scenario enum selects peer behavior and
intervention; there is no arbitrary executable selector or alternative transport.

The Windows Job owns the host and separate WSL protocol/heartbeat clients.
Protocol bytes cross `systemd-run --user --quiet --wait --pipe` into the
Type=exec, ExitType=main, KillMode=control-group service. The worker owns its peer
wait/reap. An independent WSL observer outside the Job/service holds the worker,
separate-session leaf and peer pidfds plus an unrelated sentinel.

Each service case records the same full-source/preparation fingerprint and the
hashes of the Linux files actually bundled for that case. The fingerprint binds
the complete source manifest, candidate reference and shared profile. It is not
a signature or an admission token. Case/nonce/input differ; executable source
does not. Source bytes must remain unchanged for the whole capture.

## Thirteen tests

| Cases | Required evidence |
| --- | --- |
| `valid` | Actual initialize/initialized, matching sent/received byte hashes, peer EOF receipt, peer reap 0 and independently observed clean tree |
| `foreign`, `invalid-raw` | Exact parser refusal, no initialized notification, original response bytes retained, matching initialize bytes and clean completion |
| `stop-pending` | Stop before response, notification revoked, identity-bound service Stop and no lease-expiry substitute |
| `owner-loss`, `transport-loss` | Intervene after peer receives initialized, held Windows identity kill, Linux lease-expiry record and independent cleanup |
| `pressure-stop`, `pressure-owner-loss`, `pressure-transport-loss` | Actual started/pending third drain with two queue samples above high watermark, uncertain outcome or dead-owner unknown record, independent cleanup |
| `native-refusal` | `--native` returns 2 before fixture execution |
| `partial-journal-refusal` | Empty and malformed existing files refuse fresh host startup with status 23, bytes unchanged |
| `cleanup-hook-failure` | A deliberately failed Stop callback still closes/reaps a real local child; original cleanup error retained |
| `candidate-preparation` | Unchanged plan accepted; changed candidate path/digests/executed/config/argv/source/profile refused; actual temporary-file path and changed bytes rejected |

The nine service cases each start a fresh host subprocess afterward against the
original journal/config. It must refuse status 23 and leave the attempt bytes
unchanged. Locally drained writes and peer-observed bytes remain distinct. A
dead owner cannot generate a completion report.

For the three baseline completion/refusal cases the peer records initialize,
publishes its live identity, and waits after actual EOF. The observer holds all
identities, checks the peer's receipt and releases it using the run nonce. The
host keeps heartbeat ownership until the protocol client exits. This permits
worker-owned peer reap 0 without lease expiry pretending to be clean completion.
The release marker is fixture coordination, not a protocol request.

For interruption cases the peer stays alive for 95 seconds after its required
phase, ignoring EOF. Stop uses separate identity-bound control while the heartbeat
continues; loss retires the heartbeat and requires lease expiry. Stop cases must
have no expiry record. The observer requires original pidfds signaled, original
`/proc` entries absent and cgroup empty/removed, while its sentinel stays live,
before teardown. Exactly three held original Windows process handles must signal
and Job accounting must empty without the watchdog deadline.

Unit garbage collection is unavailable terminal metadata. Default Result values
from a not-found query never establish success. Actual process, cgroup, receipt,
reap and client observations remain separate evidence.

## Future candidate preparation only

The preparation module compares candidate path/digest/installation reference with
the frozen saved installation, and binds planned `app-server --listen stdio://`
argv, source hashes and profile to the expected configuration. Inputs are compared
with JSON type distinctions preserved. Expected inputs must come from the trusted
frozen preparation record; equality of caller-supplied values alone establishes
no trust.

The plan always says `nativeExecutionAllowed: false` and
`runtimeBinaryRechecked: false`. The launcher still only executes the fixed Python
worker. The actual file-content hash test uses a non-executable Windows fixture,
not the Linux candidate. No live native binary hash, canonical filesystem identity,
startup behavior or native argv was qualified by these tests. The candidate path
check is lexical POSIX canonicality, not a symlink/permission audit.

## Profile and limits

The common profile retains outer Windows watchdog 90 s, protocol 75 s, spawn
30 s, work 15 s, cleanup phases 5 s, service runtime 60 s, service stop 5 s and
lease 1 s with 100 ms sender interval. Independent cleanup must finish within
15 s and worker lifetime stay below 30 s. Thus service/peer/leaf runtime expiration
cannot explain a pass. The local callback regression uses its recorded separate
15/5/2/2-second envelope; native refusal and preparation guards are local cases.

Pressure uses an 8 MiB synthetic third write outside the unchanged 16 KiB input
encoder. It proves local queue/drain handling, not native frame capacity, kernel
pipe capacity, sustained throughput or delivery. Queue samples occur across
scheduler yields, not a guaranteed duration or an atomic sample at the later kill.
Local abort discards queued input. A retained broken-pipe peer-close error counts
as accounted closure only with an uncertain write, exited direct client, both
EOFs and empty closing transport; it never upgrades delivery to success.

The journal is a conservative single-owner, fixed-path process-restart fence.
Power-loss directory durability, concurrent writers, hostile filesystem changes,
path changes and production recovery remain outside its guarantee. Full product
reconnect/recovery is not required before bounded transport-only U0.

The one-source regression gap is addressed by this capture. Historical L1/L2
ledgers remain unchanged; this run does not issue new admission or close privacy
requirements. P1 ambient credential/filesystem/keyring/socket/network reach and
P2 effective capture ACLs/modes/private retention/publication remain open. Fresh
HOME/env, a cgroup and Git exclusion are not isolation or access-control evidence.
Startup/deadline extremes, Stop/response races, manager failure, suspend/resume,
late buffered heartbeats and arbitrary provider trees remain unqualified.

Next: review ambient access and effective capture permissions against this exact
artifact, along with remaining source-bound preparation/admission requirements.
No provider authentication, inference or task request occurs in these fixtures;
delegated development assistance is recorded separately.

## Inspect and reproduce

From the project root, inspect hashes, preparation and saved verdicts without WSL:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/consolidated-launcher/run.py
```

`--develop` creates a fresh private cohort under `.git/tiye-consolidated-launcher-development`.
`--capture` requires this report and provenance and refuses an existing input.
`--native` always refuses. [Input](input.json), [evidence](evidence.json),
[observations](observations.json), [tests](tests.log) and [review](review.json)
bind the result. Published bytes are synthetic; no 8 MiB bulk payload is retained.
Existing measured source/evidence and readiness ledgers remain unchanged.
