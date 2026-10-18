# Owned ambient-access probe

18 October 2026. Implements the [ambient-access brief](../s6-private-matrix/NEXT-STEP.md)
without inspecting real credentials or contacting external services. A managed
mock peer can read/write a synthetic sibling directory outside its fresh HOME and
working directory, and connect to owned Unix and TCP-loopback listeners. A separate
mode-000 synthetic file returns EACCES. Process and resource cleanup are verified
independently. These are bounded reach observations, not confinement or admission.

## Product trust decision

The existing [product specification, Section 4.3](../../architecture/TIYE-Agent-Product-Specification.md)
says a CLI member runs with the user's account authority and cannot promise an
app-enforced filesystem boundary. The [architecture, Sections 5.3 and 6.1](../../architecture/TIYE-Agent-Architecture.md)
separates built-in API file guards from approved commands and shared-user CLIs.
Worktrees separate default folders/branches; they do not prevent other access.

**Decision:** retain that documented shared-account CLI mode and its capability
labels. Environment reduction, a fresh HOME, worktrees and cgroups must not be
presented as filesystem/network isolation. The observed canary reach is consistent
with that mode. Stronger isolation would require a separately implemented and
qualified boundary; this probe neither adds nor approves one. No product UI or
permission-control implementation is claimed here.

The source-native provider candidate and credential/helper/keyring/external-network
surfaces are not qualified by synthetic reach. P1 remains OPEN for those portions,
P2 remains OPEN, A1 BLOCKED and Phase 1 HOLD. Historical ledgers are unchanged.

## Source-bound runtime

The new cohort binds 34 Python sources: 21 launcher sources, six immutable storage
references and seven adapter/bootstrap sources. Of the original twenty launcher
files, nineteen copies are byte-identical; only the protocol peer gains a fixed
probe call, and `ambient_probe.py` is added. The original worker/entry, profile,
transport, Job/watchdog, observer and lifecycle checks are unchanged. This new
peer is tested only on the valid path; it does not inherit the old matrix's nine
case qualification automatically.

The probe runs after initialized and before the normal EOF receipt. It uses the
actual service worker/peer, not a lookalike standalone shell. Windows and Linux
held identities, peer bytes/receipt/reap, service/cgroup cleanup, unrelated
sentinel and restart refusal must all pass the inherited validator. The eleven
Linux bundle files are hash-checked before execution and tied to the assembled
source fingerprint. Native/provider execution remains disabled in this fixture;
development delegation is recorded separately.

Actual self-process metadata must show UID tuple 1000/1000/1000/1000, zero current
effective/ambient capability sets, umask 0077, the expected five environment names
and exact fresh HOME/CODEX_HOME/TMPDIR/cwd relationships. Mount/network/user
namespace identifiers must match the independent resource observer. This is
current process metadata, not an audit of all groups, bounding capabilities,
privilege-changing helpers, LSM rules or future processes.

## Owned resources and observations

The independent observer creates a fresh `/tmp/tiye-ambient-resources-*` directory
outside the managed service/cgroup and runtime folder. Its UID is 1000 and mode
0700. It owns the canaries/listeners and remains separate from the peer.

| Resource | Actual operation and required evidence |
| --- | --- |
| `read.txt`, 0600 | Peer opens the exact owned file without following a final symlink; bytes match the nonce-derived synthetic hash |
| `peer-write.txt`, 0600 | Peer creates exclusively, writes/fsyncs; observer reads through a no-follow descriptor and verifies bytes/owner/mode |
| `deny.txt`, 0000 | Peer attempts a read and records errno 13; no mode change or successful control-file read is inferred |
| `service.sock`, 0600 | Peer connects and exchanges the run nonce/ACK; observer's SO_PEERCRED PID/UID/GID matches the held protocol peer |
| TCP loopback | Owned listener binds only 127.0.0.1 with an allocated port; nonce/ACK and both endpoint tuples correlate |

Unix peer credentials describe the process at connection; this use follows
[Linux unix(7)](https://man7.org/linux/man-pages/man7/unix.7.html).
They are correlated with the protocol peer's existing identity, not assumed to
identify its outer worker. TCP has **no PID attribution** in this probe. No
external address, provider endpoint, real keyring, credential store, home directory
listing or arbitrary user-supplied target is accessed. The nonce is synthetic
fixture data, not an account credential.

Same-UID mode 000 denial is a single observed DAC result. That UID owns the file
and could change its mode; no such change is made. This does not prove read-only
CLI enforcement or inability to access other account resources. Likewise, a
loopback connection proves local reach, not internet access or restriction.

## Ownership and cleanup

After the service peer and original lifecycle fixture finish, the observer joins
both listener threads and closes the listener descriptors. It rechecks the owned
root and each fixed entry's UID/type/mode/inode/device. Only those exact fixture
entries are unlinked, followed by a nonrecursive rmdir. Root absence, closed held
socket descriptors and stopped threads are required separately from the service's
process cleanup. There is no post-close connection attempt to an unowned/rebound
port. Inode/path checks are bounded observations, not a hostile-filesystem proof.

Partial setup closes known listeners and joins started threads before propagating
failure. Original observer errors retain cleanup failures as notes. Failed or
unexpected filesystem states can leave a quarantined synthetic directory; such a
run does not publish a successful cleanup verdict. Error paths, close failures,
malicious races and repeated resource exhaustion are not fully qualified.

The synthetic resource directory is removed on the accepted path. The Linux
runtime bundle/results and protected Windows raw capture remain retained; their
retention is distinct from canary/listener cleanup. No expiry or deletion API for
those captures is introduced.

## Private evidence and verification scope

Protected Windows storage is verified before spawn. Eighteen fixed Windows files
include full protocol evidence, the ambient event and a held-file storage audit.
Raw paths, ports, PIDs, namespace IDs, nonce/content hashes and current capability
metadata remain private. Public output is a strict, newly constructed boolean/
scope record. Its nonclaims (credentials, external network, TCP PID attribution,
confinement and deletion) cannot be promoted by the offline validator.

One live end-to-end test performs all five resource operations and both cleanup
checks on the same peer. Six offline tests check saved integrity, private-field
injection, unsupported scope promotion, peer/nonce/endpoint/capability mismatch,
cleanup/denial/ownership mismatch and admission promotion. Their malformed raw
records are explicitly synthetic test inputs, not additional live qualifications.
Default checks verify selected hashes/schemas; they do not replay private evidence
or re-probe the current machine. Hashes are not signatures or permission grants.

GPT-6 Luna max and GLM-5.3-Flash Free max completed reply-only design reviews;
neither reviewed final source nor ran the live test. Their identity, environment,
endpoint and cleanup concerns informed the added actual checks. Fallback was not
needed. The recorded consumer Gemini exclusion remains in force. Codex emitted
ambient MCP authentication warnings despite its isolation option; no network-
silence claim is made for development assistance. See [review.json](review.json).

## Inspect and continue

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/ambient-access/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/ambient-access -p test_publication.py -v
```

`--develop` runs a new owned fixture and saves only selected evidence beneath
`.git/tiye-ambient-access-development`. Raw Windows capture stays in LOCALAPPDATA.
`--capture` requires this report/review and refuses existing input; `--native`
refuses before fixtures. Only this top-level runner is the supported entry point;
copied historical helper runners are bound references.
See [input](input.json), [observations](observations.json), [tests](tests.log),
[assessment](assessment.json), [evidence](evidence.json) and [next step](NEXT-STEP.md).
