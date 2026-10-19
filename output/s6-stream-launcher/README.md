# Managed launcher with protected streaming capture

19 October 2026 · **4 live managed cases / 4 offline refusal tests · Native disabled**

The new composition connects the [protected writer](../s6-stream-writer/README.md)
to the original supervised mock transport. Actual Windows/WSL pipe chunks go to
protected files instead of full-stream bytearrays and base64 result payloads.
This qualifies the four cases below on a new source set. It does not inherit the
entire earlier matrix or admit a native candidate. L1/L2 remain PARTIAL, P1/P2
OPEN, A1 BLOCKED and Phase 1 HOLD. Historical sources and evidence are unchanged.

## Actual composition

The [host wrapper](../../feasibility/s6-wsl/stream-launcher/host.py) verifies its
source map, scenario/mode pair and configuration shape before allocation or
launch. It creates and checks protected stream storage before invoking the frozen
host. A private prelaunch intent binds the attempt nonce, composition fingerprint,
exact configuration digest and stream location. Final writer results carry the
same binding. Same-path restart is refused before allocating another writer or
invoking the original host; both attempt and writer intent are verified unchanged.

The original host still runs inside the creation-time Windows Job/watchdog and
owns distinct WSL protocol and heartbeat clients. Linux still uses the fixed
systemd service, worker, protocol peer and leaf, with an independent observer
holding pidfds and an unrelated sentinel. The original bundle's peer file is
replaced by a separately bound [peer extension](../../feasibility/s6-wsl/stream-launcher/protocol_peer.py)
for controlled stderr generation. Actual bundle hashes are retained privately.

The [transport adapter](../../feasibility/s6-wsl/stream-launcher/adapter.py) reuses
the original handshake parser, serialized writes, work cancellation and cleanup
routines. Its pump reads at most 16 KiB, feeds the writer and propagates capture
faults into work cancellation. Readers continue bounded drain/discard through
cleanup. The inherited raw bytearrays stay empty. Legacy raw fields and duplicate
protocol byte files remain empty compatibility placeholders, explicitly tagged
`rawFieldsSuppressed`; they are never evidence of absent output or original-byte
equality. Real retained/discarded/uncertain counts come from the writer.

Only no protocol fault, both stream EOFs, direct-client reap and no cleanup errors
allow synchronous **storage-only** completion. Independent Linux and Windows tree
cleanup is checked afterward by the controller. Storage completion alone does
not establish that tree cleanup, task delivery or a provider route is qualified.

## Four measured cases

| Case | New combined evidence |
| --- | --- |
| Valid handshake | Native-shaped mock initialize/initialized exchange, peer receipt byte hashes, protected stream readback/manifest, held-process and cgroup cleanup; storage complete |
| Stop while awaiting initialize response | One locally drained initialize, no notification, identity-bound service Stop, both EOFs and independent cleanup; storage left incomplete |
| Initialized owner loss | Controller kills the held Windows owner; Job descendants terminate and Linux lease expires; only prelaunch writer intent and a bounded raw prefix survive, with no protocol/writer final result or completion |
| Actual stderr overflow | After observer-confirmed live pidfds, controller releases the peer to emit more than 1 MiB stderr; writer retains exactly the cap, counts discard, revokes work, retires heartbeat and verifies cross-OS cleanup; no storage completion |

For overflow, private monotonic timestamps verify capture fault before work-stop,
then cleanup-hook entry and return. The frozen callback retires and joins the
heartbeat before returning. The Linux observer separately verifies lease expiry,
original pidfd signaling, process absence, empty/removed cgroup and a live unrelated
sentinel. Readiness precedes the controller's overflow signal. We do not compare
absolute Windows and Linux monotonic clocks.

The overflow protocol client reports Linux lease-expiry exit **71**. The older
transport-loss fixture deliberately killed a Windows client and recorded **77**;
that expectation does not apply here. The wrapper accepts the new overflow fault
only with the explicit lease-expiry return code, both EOFs, owned direct reap,
no signal fallback, no spawn uncertainty and no heartbeat/cleanup errors. This
is a fixture-specific expected failure, not a successful protocol task.

The parent reuses the original witness, identity, phase and attempt validators.
It explicitly adapts protocol checks for private files and the new fault. It
does not claim a full pass through the old raw-base64 protocol validator. Writer
and watchdog nonce/root identity/configuration bindings reject stale results.
Offline stale-binding tests reject mismatches; no general late-event state
reconciliation service or second cleanup pass is implemented.

An initial development run failed only because its overflow assertion expected
77 rather than the actual 71. Its diagnostics remain private and it is excluded
from qualification. The final source-bound four-case run passes. Later reruns
were made after adding binding and receipt checks; no failed run is relabeled.

## Custody, budgets and scope limits

The unchanged writer enforces 4 MiB stdout, 1 MiB stderr, 1 MiB aggregate metadata,
16 KiB feed chunks and 256 KiB stdout record length. A separate parent audit
checks actual stream inventory, current protected permissions, single-link files,
sizes and hashes through bounded reads after host exit. The valid manifest is
compared with that independent audit. Owner loss never fabricates final counters.

Controller journals/configuration, lifecycle results and observer diagnostics
remain in a separate protected capture. Their exact expected inventory and file
permissions are checked after cleanup, with 8 MiB per file / 32 MiB per case
post-run bounds. The audit record excludes itself and is written last. These are
post-run fixture audits, not a live quota on every process output. They do not
yet establish the native contract's single aggregate metadata budget across the
whole controller/stream composition. A separate protected controller diagnostic
capture retains full test logs and private records. No raw stream, private path,
identity or raw hash is published in selected case records. No capture is deleted.

Synchronous capture I/O can stall the event loop and delay local Stop handling.
The independent Job watchdog, Linux lease and service lifetime remain in place,
but hard filesystem latency and all syscall-failure points are not qualified.
The reused 60-second service, 75-second protocol and 90-second watchdog limits
are mock bounds; they are not the native contract's admitted end-to-end schedule.
No bytearray/queue-free claim extends to kernel buffers or parser allocations;
the original bounded handshake parser still buffers a record.

Only stderr overflow is integrated here. Stdout/record overflow, partial writes,
reader failure, late callbacks, reboot/power loss, hostile mutation, parser/RSS
ceilings and deletion/recovery of this new larger composition are not newly
qualified. Earlier standalone checks do not transfer those qualifications.
The Stop case waits for an initialize response; it is not a pending-pressure-write
cancellation test. The overflow peer and its one-shot controller signal are
synthetic owned fixtures, not provider behavior or network isolation.

## Verification and next work

[Observations](observations.json) bind the source references and selected verdicts.
[Evidence](evidence.json) hashes this report, observations and
[review dispositions](review.json). Hashes assume repository integrity; they
are not signatures or a replay of the protected evidence.

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/stream-launcher/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/stream-launcher -p test_publication.py -v
```

Both commands are offline. Four refusal tests cover private fields/false verdicts,
source/case/admission drift, scenario/config mismatches and stale result binding.
`--develop` creates four fresh Windows/Ubuntu managed fixtures, protected retained
evidence and selected `.git` output. No native mode or admission-generation mode
exists. Luna and GLM completed supplied-context design reviews; neither reviewed
final code or ran fixtures. Gemini remained excluded under the recorded route
decision. No fallback was needed. Parent guard checks and preserved historical
writer/native-contract checker results are recorded in review.json.

**Next:** inspect the pinned native candidate's startup/config/helper discovery
without executing auth or dumping account files, and reconcile actual controller
metadata budgets and the native deadline profile. Then review the exact proposed
U0 composition against L1/L2/P1/P2 before issuing any separate admission. The
authenticated model task still requires provider-route resolution and its own
wire/effect contract. Do not repeat equivalent lifecycle cases to imply closure.
