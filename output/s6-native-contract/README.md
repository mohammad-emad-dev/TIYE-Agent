# First native acceptance contract

19 October 2026 · **Offline plan implemented · Native execution disabled**

[contract.json](contract.json) specifies the first candidate operation, its
inputs, budgets, credential boundary and separate result axes. The
[checker](../../feasibility/s6-wsl/native-contract/check.py) verifies the frozen
plan and referenced bytes. It launches nothing and cannot grant admission.
L1/L2 remain PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD.

## Scope correction: first transport, later authentication

The [original native protocol](../s4-codex-native-protocol/README.md) explicitly
allows preparing a local transport-only U0 independently of paid-product route
eligibility. The [18 October reconciliation](../s6-admission-reconciliation/README.md)
overgeneralized that route requirement to every native attempt. This contract
supersedes that interpretation: **U0 needs its own runtime/capture/cleanup review;
authenticated A0/T0 needs provider-route resolution as well.** No execution gate
is closed by correcting the distinction. U0 establishes no product permission.

The inquiry has a confirmed form receipt. No substantive reply evidence is
available in the repository; no inbox was accessed and no new policy lookup or
eligibility decision was performed here. Existing account declarations remain
the input for later route qualification. No new contact details or secrets are
requested or published.

## U0: exact planned operation

The saved candidate is Linux Codex 0.157.1 in Ubuntu under the recorded nonroot
UID 1000. The contract binds its expected binary digest and installation-record
reference, rather than publishing the installation's absolute private path.
Before admission, recheck the actual executable and helpers and freeze the final
source composition. The candidate argv tail remains `app-server --listen stdio://`
from the saved version/help evidence; current startup behavior is unqualified.

Exactly one attempt sends the pinned strict UTF-8 initialize JSONL packet with
ID 1. Only a valid correlated successful response permits the initialized
notification. Required response fields, fresh CODEX_HOME correspondence and Linux
platform checks follow the saved schema. The contract contains both exact packets.
No login, account, model, thread, turn or server-request reply belongs to U0.
Unexpected packets, errors, conflicting/duplicate responses, malformed framing
or premature EOF stop protocol progress. EOF after the planned exchange is an
exit observation, not a vendor graceful-shutdown guarantee.

The child environment starts empty, with only PATH, LC_ALL, HOME, CODEX_HOME and
TMPDIR. Runtime directories and cwd are fresh synthetic locations; cached
configuration and credentials are never copied. The effective Windows process
chain still needs a reviewed minimal environment. Before admission, inspect
selected-version config/credential discovery, helper launches, keyrings, mounts,
sockets, identities and network reach through nonsecret evidence. Classify each
boundary as enforced, observed, unresolved or not applicable. Fresh directories,
allowlists and cgroups alone do not establish absent authentication or isolation.
An unresolved surface needs an explicit risk/stop decision and a truthful label;
this plan does not declare all ambient access denied.

## Planned timing and storage

All numbers below are experiment limits, not measured native performance.

| Boundary | Contract |
| --- | --- |
| Overall deadline | One host monotonic origin before spawn; 90 seconds total |
| Protocol work | Cut off by elapsed second 60; earlier faults start cleanup immediately |
| Phase maxima | Host-to-WSL 30 seconds, child startup 15, initialize 15; each clipped to remaining work time |
| Cleanup and observation | Up to 15 seconds for EOF/TERM/KILL phases of 5 seconds each; reserve 15 for independent observation, all inside 90 |
| Input | 16 KiB per record including LF; 32 KiB total for the two planned packets |
| Output framing | 256 KiB per stdout record excluding LF; fixed reads up to 16 KiB |
| Retained raw streams | Stdout 4 MiB, stderr 1 MiB, LF included in retained stream bytes |
| Other host capture files | 1 MiB aggregate, including journals, manifests and allocator records; 6 MiB total capture |
| Proposed raw-buffer allowance | 512 KiB across readers/framing; excludes parser heap and process RSS, still requires implementation review |

Record monotonic phase-entry/exit, cutoff, cleanup and observation timestamps.
The phase maxima sum to the work allocation and add no extra time. A deadline
overrun fails; it cannot consume reserved cleanup/observation unnoticed. Review
the independent watchdog and actual service deadline together: the existing
60-second service and 75-second protocol profiles are mock measurements, not a
qualified native schedule. Unverified cleanup blocks another launch. Never kill
an arbitrary PID or terminate the user's entire distribution to claim success.

**The native stream writer is unimplemented.** Existing protected Windows
allocation accepts 64 KiB per file. The standalone Linux store accepts 64 KiB per
payload and 96 KiB total. Its integrated fixture stores compressed source/witness
archives, not arbitrary native streams. Neither accepts this planned native
capture contract. Implement a new bounded writer and verify its effective capture
paths before composing it with a native launcher. Preserve the sealed cohorts.

The writer must count bytes before persistence, retain a bounded prefix, mark
overflow and begin cleanup. Concurrent readers then drain and discard in fixed
chunks until bounded cleanup ends; they must not wait for process exit to start
draining. Reader failure aborts owned pipes and escalates immediately. Storage
failure leaves unsealed, uncertain evidence; no fallback spills to public logs
or an unbounded temporary file. Permissions are verified before spawn. These
planned writer limits are not a filesystem quota or a process/parser memory cap.
Native runtime writes and parser/resource accounting remain explicit admission
work. Do not retrofit fixture API limits into a native qualification claim.

## Acceptance, stop and retention

Report handshake, write delivery, natural exit, escalation, owned-tree cleanup,
capture integrity, authentication observation, route eligibility and task delivery
separately. Values are pass, fail, unknown, not-run or not-applicable.
U0 has no model task, so task delivery is not-applicable. Handshake pass requires
the exact exchange; locally drained writes do not establish peer receipt of the
initialized notification. Binary drift, incomplete capture, overflow or missing
independent tree cleanup prevents a complete U0 pass. Escalated cleanup cannot
be relabeled natural zero exit or undo an already observed handshake.

On any contract stop trigger, revoke dependent writes, perform bounded
identity-checked cleanup and preserve private evidence. If ownership or delivery
is uncertain, block retries/relaunch until an explicit recovery review. Retain
uncertain groups; no automatic expiry, rollback or purge is authorized. Public
output requires private inspection and field-allowlisted derivatives, never raw
native streams, private account fields or raw native capture hashes.

The future admission record must bind final sources, candidate/helper identities,
runtime and capture roots, environments, task/packet inputs, all budgets,
attempt identity, L1/L2/P1/P2 decisions and the reviewer decision/evidence.
This offline checker emits no such record. Power loss, hostile same-UID changes,
concurrent deleters, secure erasure and caller-record loss remain unqualified.
Whether stop/quarantine suffices must be decided for the exact experiment.

## Later T0 marker task

The contract also fixes a proposed one-turn prompt to create only `TIYE_PROBE.txt`
containing `TIYE_NATIVE_PROBE_V1` plus LF, in a new Linux Git fixture with a recorded
baseline commit/tree and private run nonce. Independently compare exact bytes,
all file changes, Git diff and untracked/ignored inventory afterward. Keep the
real project out of the write target. No rollback is presumed.

T0 remains not admitted. It requires provider-route resolution, official
user-controlled auth, exact `gpt-6-luna` / `max` wire configuration, an enforced
effect boundary and a separate task-bound admission. The prompt is not effect
enforcement. Auth/thread/turn/approval packets are not defined by the U0 exchange.

## Verification and next implementation

From the repository root:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/native-contract/check.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/native-contract -p test_contract.py -v
```

The checker rejects native/admission promotion, route conflation, critical
candidate/wire/environment/budget drift, duplicate JSON keys, nonfinite numbers,
path escapes and changed indexed bytes. It checks a frozen document, not runtime
acceptance of a native result. Its index is local integrity evidence, not a
signature or protection against an operator replacing both index and code.
There are no capture, native, seal or admission-creation modes.

Luna and GLM completed supplied-context reviews, with no tools or file edits.
Their [reports and dispositions](review.json) distinguish adopted findings from
rejected advice. Gemini remained excluded under the recorded route decision;
no fallback was needed. [Verification](verification.json) records parent checks.

**Next implementation:** build the bounded protected stream writer with overflow,
partial-write and private-publication behavior before final launcher composition.
In parallel, inspect the pinned candidate's startup/configuration sources without
executing login or dumping account files. Do not repeat equivalent mock lifecycle
cases or wait on the provider inquiry to implement these local prerequisites.
