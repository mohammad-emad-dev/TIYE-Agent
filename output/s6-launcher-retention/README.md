# Launcher storage and completion integration

18 October 2026 · **3 live managed cases · 4 offline checks · Native disabled**

This new composition connects Linux runtime allocation and retained evidence to
the managed mock launcher. It reuses the unchanged twenty launcher sources,
Windows protected allocator and private wrapper. The added Linux policy governs
when the measured storage transaction can resume for evidence writes and seal.
Historical cohorts and ledgers are unchanged. P1/P2 remain OPEN and A1 BLOCKED.

## Allocation before managed launch

The Linux bootstrap creates a fresh 0700 group containing a 0700 runtime directory
and a UUID capture initialized with uncertain retention. Runtime source files are
created under umask 0077. Before signaling prepared, it verifies their actual
owner, mode 0600, regular-file type, single link, absent extended attributes,
bounded size and hash through no-follow descriptors. It verifies the group
inventory and records runtime/capture directory identities, boot ID, nonce and
composition fingerprint. The existing Windows wrapper verifies its own private
allocation before spawning the observer/host paths.

The initial ten-file launcher bundle is unchanged. Four additional runtime files
provide the original host source for hash checking, original lifecycle validator,
unchanged Linux storage implementation and new finalization policy. Source bytes
for these extras are compressed in the generated bootstrap to stay within native
Windows command-line limits. The host checks the full fourteen-file runtime hash
map against its own sources; the finalizer checks it against the group record and
actual files. The fingerprint binds **31 Python files/references**: six new sources,
twenty launcher sources, two Windows allocator modules, two private-wrapper
modules and the original Linux store.

The observed managed path still uses the Windows Job/watchdog, separate WSL
protocol/heartbeat processes and a systemd user service with worker, peer and
leaf. An independent Linux observer holds process identities with pidfds and
checks peer receipt/reap, cgroup cleanup and an unrelated sentinel. Original
Windows process handles and Job cleanup are checked separately. This cohort
qualifies only the three listed cases, not the earlier nine-mode matrix.

## Evidence custody and sealing decision

After the observer returns through its cleanup block, the bootstrap writes a
saved observer result and nonce/source-bound completion marker. The Windows test
waits for observer/host processes, validates the complete lifecycle record and
checks runtime/source correspondence. A second Linux process runs the same
lifecycle validator, matches the saved observer result exactly and verifies the
boot, group, nonce, mode and directory identities before finalizing evidence.

The new `LauncherCapture.resume_empty()` policy is an explicit extension of the
standalone storage contract. It accepts only the original exact retention record
with no payload, completion, deletion intent or unknown entry. It cannot resume
partial writes or an existing capture. Caller validation of the completed mock
process lifecycle precedes that transition. It grants no isolation from another
program running as the same owner. The previous store's ordinary reopen behavior
is unchanged in its sealed cohort.

A one-attempt finalization record is created exclusively. The finalizer accepts
only a fixed runtime inventory, verified 0600 regular single-link files without
xattrs, and empty 0700 HOME/CODEX_HOME/temp directories. Unknown files or contents
cause quarantine before payload writes. Runtime files are archived with their
source bytes and the full validated cross-OS witness is retained separately.
Both are compressed into the store's fixed `stdout.bin`/`stderr.bin` payloads;
these names hold an archive and witness here, not just terminal streams.

The uncompressed runtime archive is limited to 128 KiB, each stored payload to
64 KiB and the combined payloads to 96 KiB. Stored bytes are read back and
compared. These bounds cover this fixed fixture, not live runtime disk usage or
arbitrary native output. Only a valid normal mock receipt/reap plus the validated
cleanup witnesses permits `seal()` and a successful storage-manifest review.
The storage completion marker still means synchronous storage completion. It
does not establish provider success, native eligibility or business-task delivery.

| Live case | Actual outcome |
| --- | --- |
| Valid receipt and completed lifecycle | Archive/witness stored and read back; storage sealed and retained |
| Owner loss | Process cleanup verified; evidence archived but completion absent and uncertainty retained |
| Otherwise valid run with an actual unexpected runtime file | Inventory rejected before payload writes; retention and runtime quarantined |

Each case also attempts a second finalization. Completed/partial evidence is
refused by the empty-capture rule; the quarantined case is refused by the existing
attempt record. Hash audits before/after that refusal verify capture files and
the attempt record are unchanged. This is a one-attempt guard, not automatic
recovery. The unexpected file is created only inside that exact fresh fixture.

## Retention and remaining boundaries

Linux runtime directories, group/attempt records, sealed or uncertain captures
and protected Windows raw evidence are retained. The archive snapshots runtime
files; group metadata remains separately retained. No integrated deletion or
expiry operation is added. The standalone store's earlier deletion/recovery
tests do not qualify deletion of this larger group. Partial I/O leaves an
unsealable capture; existing partial payloads or metadata cannot use the new
empty-resume path. Exhaustion and interruption at every finalizer syscall are
not qualified by these three runs.

Directory descriptors, no-follow opens, file metadata checks and boot/run binding
reduce accidental substitution. They do not prevent malicious same-UID changes,
all verification/unlink races, privileged access, concurrent finalizers across
arbitrary paths, reboot/power-loss failures or repository tampering. Captured
held-process witnesses describe the original observation; the finalizer does not
claim to reopen the original pidfds. A source hash is not an independent signature
or authorization grant. Stronger confinement and native auth remain unresolved.

## Publication and checks

The host retains full lifecycle/finalizer results and retry diagnostics inside
the protected Windows capture. Existing Windows final-file permission/inventory
audits also pass. Private paths, nonces, PIDs, boot IDs, directory identities and
raw archives are omitted from newly constructed public records. The initial
Windows journal retains unknown delivery; no historical attempt is relabeled.

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/launcher-retention/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/launcher-retention -p test_publication.py -v
```

Default checks verify saved hashes and selected scope, not a replay of private
evidence. Four offline tests cover field omission, forbidden seal promotion,
identity/witness/budget mismatch and incomplete or promoted public records.
`--develop` creates fresh selected output under `.git`; raw remains in protected
Windows/Linux stores. `--capture` requires report/review and refuses existing
input. `--native` refuses before fixture setup. Live runs require Windows/Ubuntu,
the already-qualified UID and systemd fixture environment, with no provider login.

GPT-6 Luna max and GLM-5.3-Flash Free max provided reply-only design reviews;
neither reviewed final source or executed tests. We adopted explicit identity,
source, boot and witness binding plus uncertainty and repeat-attempt refusal.
We rejected wording suggesting a mock receipt was nonsynthetic or that this was
general recovery/attestation. Gemini remained excluded under the recorded route
decision; fallback was unnecessary. Development delegation is separate from the
managed mock qualification. See [review](review.json), [results](observations.json),
[evidence](evidence.json) and [next step](NEXT-STEP.md).
