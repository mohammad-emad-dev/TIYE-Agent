# Mock launcher with private capture storage

18 October 2026. Implements the
[private-storage integration brief](../s6-private-capture-store/NEXT-STEP.md).
Three representative launcher paths now use protected Windows capture storage:
clean completion, pending Stop and owner loss. Two launch gates test storage
failure and changed intent. Native admission remains disabled, P1/P2 OPEN and
Phase 1 HOLD. This is mock qualification, not product construction or admission.

## Source composition

The new fixture subclasses the frozen consolidated test harness. It overrides
allocation, the pre-prepare storage check and final evidence handling; the actual
wire transport, Windows Job/watchdog, heartbeat, Linux service/observer and
lifecycle validator remain unchanged. No historical source or evidence is edited.
The suite selects three explicit inherited methods rather than rerunning all
thirteen consolidated tests.

The shared fingerprint covers 32 files in three inventories: 20 consolidated
launcher sources, six storage-prototype sources and six new integration sources.
The storage prototype's `store.py` and `winacl.py` execute here; the remaining
prototype files are bound references, not additional tests run by this capture.
The Linux bundle hashes are checked against the original ten bundled files.
The same assembled fingerprint is required in each new private case record.

## Private allocation and routing

Before the observer, host or heartbeat/protocol clients can start, the adapter
creates a protected LOCALAPPDATA root and protected per-case directory. It checks
both held descriptors and an exclusive retention record. The intent record's
actual SHA-256 must still match the bytes written before launch. Only the current
process-token user, SYSTEM and Administrators receive full control.

The inherited harness gets that directory as `self.root`; its Windows host
configuration uses the same private `windowsRoot`. Raw observer/protocol streams,
diagnostics, host/watchdog configuration, journal, Stop records and restart fence
remain there. The normal Windows TEMP/TMP tuple also points there. The host/Job
uses the configured private working directory. The independent observer retains
its original launcher working-directory behavior; this is routing of the known
artifact set, not filesystem confinement of all possible process writes.

Original producers use ordinary file creation under the protected inheritable
DACL. Journal replacement uses `mkstemp(dir=directory)` and same-directory
replace, rather than importing a pre-created file from elsewhere. Final inherited
file permissions are checked after all fixture children and diagnostic handles
close. Adapter retention/evidence/audit records instead receive explicit protected
file DACLs at creation. The audit accepts only the exact three expected principals,
owner, full-control masks and corresponding explicit/inherited flags. Reparse
points, unexpected files, permission-query failures and budget overflows refuse
publication. This is not a per-open security rewrite of the frozen producers.

## Bounded artifact contract

The fixed per-mode inventories contain 17 files for clean completion, 20 for Stop
and 14 for owner loss. Windows file reads/audits are limited to 8 MiB per file and
32 MiB per case. These are **post-run publication checks, not a live disk quota**.
The original transport's 4 MiB stdout and 1 MiB stderr retention bounds remain
unchanged. Arbitrary diagnostic growth and adversarial writers are not qualified.
Only the three named modes are admitted by this adapter.

Full lifecycle records, JSON-embedded base64 and private absolute paths stay in
`private-evidence.json`. A separate protected `storage-audit.json` retains final
file hashes/security observations and prelaunch descriptors; its own hash is
excluded from itself. A final audit also verifies that audit file's permissions
and size. These raw records are not copied to Git or to the selected public JSON.

## Uncertainty and retention

The exclusive retention file records launch intent, source fingerprint, logical
owner/purpose, UTC creation time, unknown delivery and required retention before
any child starts. It is not rewritten into a success assertion. The adapter seals
a separate witness only after the frozen full lifecycle validator passes, then
checks source/bundle identity, saves private evidence and audits the artifact set.
Windows handles/Job emptiness, independent Linux pidfds/cgroup state, sentinel
liveness and restart refusal remain required; a child return code is insufficient.

Owner loss still has no host completion report and unknown delivery. Pending Stop
has its own cancelled-before-response outcome. Clean completion retains actual
peer receipt/EOF/reap checks. The attempt journal's conservative `delivery: unknown`
is preserved in every case. No inference of task execution or provider delivery
is added.

**Every integration capture is retained.** This adapter exposes no deletion API
and never grants deletion from a witness or process status. Failed, changed-intent
and incomplete captures remain for a separate explicit review; there is no TTL,
quota, automatic reclamation or crash-recovery transaction. Even successful
capture does not mean directory deletion.

## Five live tests and four offline regressions

The live suite exercises actual valid handshake/completion, pending Stop and
Windows-owner kill, each with the original cross-boundary cleanup/restart checks.
An injected GetSecurityInfo denial must stop allocation with no Popen call. An
actual overwritten intent file must refuse the prelaunch gate with no Popen call.
Only those two OS process/security boundaries are mocked in the gate tests.

The public selector constructs a new record from exact approved boolean/count/
enum fields. It never forwards arbitrary raw record keys. Four offline tests
verify saved integrity, reject raw/private-path fields, reject dead-owner success
or deletion promotion, and reject missing cases/over-budget verdicts.

Offline verification checks saved selected verdicts, exact source/contract/artifact
hashes and admission limits. It does **not** replay the private raw evidence or
recompute Windows ACLs on another machine. Those observations were validated
before selection. Hashes are integrity references, not signatures.

## Remaining limits and review

Windows alternate-token denial remains untested. The same user, administrators,
SYSTEM, backups and authorized security changes remain outside this protection.
Ancestor handles and final-file checks do not qualify hostile creation/open races
or establish a general filesystem sandbox. Credentials, network, keyrings and
sockets remain under P1. Linux temporary files keep the original mode/UID behavior;
Linux storage/privacy is not upgraded by the Windows adapter.

GPT-6 Luna max and GLM-5.3-Flash Free max completed reply-only contract reviews;
neither reviewed the final source or ran the live tests. Their routing, journal
replacement, held-file audit and uncertainty concerns were checked against the
source and captures. GLM's generic suggestion that journal temps were created
elsewhere does not match this journal implementation. Its broader per-open
confinement recommendation remains a stated limitation. Fallback was unnecessary.
The recorded consumer Gemini exclusion remains in force. Codex emitted ambient
MCP authentication warnings despite its isolation option; no delegate network-
silence claim is made. Provenance is in [review.json](review.json).

## Verify and continue

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/private-launcher/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/private-launcher -p test_publication.py -v
```

Default verification is offline. `--develop` creates a fresh selected-evidence
cohort under `.git`; raw captures still use protected LOCALAPPDATA. `--capture`
requires the report/review and refuses existing input. `--native` refuses before
running fixtures. See [input](input.json), [selected observations](observations.json),
[tests](tests.log), [evidence](evidence.json) and [next step](NEXT-STEP.md).
