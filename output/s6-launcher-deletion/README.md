# Reviewed deletion of a complete retained launcher group

18 October 2026 · **5 live managed cases · 3 offline checks · P2 OPEN**

This new cohort implements reviewed removal of a fresh synthetic Linux launcher
group, including runtime, capture payloads, completion/retention and group/attempt
records. It preserves historical cohorts and Windows evidence. Only groups
created by the active new fixture are passed to the helper; it performs no scan
for old captures. The helper also checks the new composition fingerprint, run
binding and expected temporary-group path. Native execution remains disabled.

## Review before any deletion

The fixture runs the original managed Windows Job/WSL/systemd path and validates
both operating systems' held-process, receipt/reap and cleanup witnesses. The
retention adapter archives and seals only the normal valid mock run. Deletion
review additionally requires the matching saved observer result, completion
marker, source hashes, boot/run/directory identities and exact group inventory.
It verifies the sealed capture and compares its compressed archive and witness
against the current runtime and full lifecycle record. Decompression is bounded.
Unknown runtime data, missing completion and owner loss cannot obtain a review.

The review records every accepted file's hash, device/inode, owner/group, mode,
size and single-link metadata, plus directory identities. Accepted files are
regular, owned mode 0600 without extended attributes; directories are owned 0700
without extended attributes. The file/directory layout is fixed and bounded.
The review is created exclusively and fsynced as `delete-review.json`.

The review file excludes itself from the content inventory. Its actual identity
and hash are instead returned with the manifest as a caller token. Before the
first unlink, the controller writes the complete token and lifecycle record to
the protected Windows `witness.json`, flushes the file and verifies its actual
hash/security through the existing allocator helper. This external copy survives
normal deletion of the Linux group. Cross-device reboot/power-loss durability and
automated recovery after controller failure are not qualified.

This is explicit reviewed fixture deletion, not an expiry policy. Possession of
the token is not a cryptographic authorization boundary against the same owner.
The entry point exposes no arbitrary-path purge or historical-capture deletion.

## Ordered operations and bounded resume

An independently loaded, source-hash-checked in-memory helper performs deletion.
It does not execute code from the runtime while deleting it. Initial review
imports only the already hash-checked fixture modules; later deletion/resume
requires no runtime imports. The worker's code and input sizes are bounded.

Deletion requires the exact caller token, saved review identity/content and group
identity. It creates and fsyncs a matching `delete-intent.json` before removal.
The deterministic plan removes runtime files and empty HOME/CODEX_HOME/temp
directories first, then runtime itself. It removes capture payloads, completion,
retention and capture directory next. Group/finalization metadata follow, then
review, intent and the empty group. File removal is unlink; directory removal is
nonrecursive rmdir. Parent directory changes are fsynced.

The helper rechecks remaining inventory, file hashes/metadata and directory
identities before each mutation. Unexpected entries and changed files refuse.
On resume, missing paths must form the exact prefix of the reviewed plan, with
the matching review and intent still present. Missing paths without intent do
not establish an interrupted deletion. This prefix rule assumes no external
actor is manipulating the group; it does not prove who removed an absent file.

A worker exit after the first runtime-file unlink is measured. Another worker
uses the externally retained token and persisted review/intent to complete the
remaining plan. In the final metadata test, a worker exits after review removal.
The next worker refuses further deletion, leaving the intent-only group
quarantined. Missing review never authorizes automatic cleanup. An interruption
after intent removal but before rmdir can likewise require a separate manual
decision; that window is not measured here.

## Actual qualification cases

| Live managed case | Verified outcome |
| --- | --- |
| Complete removal | Reviewed runtime/capture/metadata/group removed; absence checked by held-parent stat and separately by controller |
| Interrupted payload removal | Worker exits after one runtime-file removal; a new worker resumes and removes the group |
| Final metadata interruption | Worker exits after removing review; retry refuses and only intent remains |
| Owner loss | Uncertain capture cannot obtain deletion review; whole-group byte/identity hash unchanged and no deletion records created |
| Unknown runtime file | File added after successful sealing; review refuses, whole-group hash unchanged and no deletion records created |

The complete-removal case also supplies a wrong caller review digest and makes
an equal-size change to an owned runtime marker after review. Both attempts fail
before deletion, with whole-group hashes unchanged across each refusal. The
fixture restores that marker's original bytes in the same inode, verifies the
reviewed state again and then completes removal. These checks compare content
and recorded identities, not immutable modification timestamps.

The integrated group has its own qualification. It does not inherit the earlier
standalone store's deletion tests. Five fresh managed runs bind **36 Python source
files/references** including the unchanged launcher, retention adapter, Linux
store and Windows allocator/private wrapper. Luna and GLM supplied reply-only
design reviews; neither reviewed final code or executed tests. We adopted the
separate control-file binding, external caller copy, remaining-suffix checks and
post-review mutation guard. We did not adopt a claim of general crash recovery or
a requirement to re-review a partially deleted group: that is not this protocol.

## Limits and remaining work

No recursive deletion, user-account creation, credential access, provider task,
native launch or authentication change is part of the fixture. Only fresh owned
synthetic Linux groups are removed; Windows raw evidence remains retained and
protected. The metadata-quarantine and refused groups remain retained in Linux.
There is no secure erase, backup/history removal, automatic expiry or general
cleanup API for uncertain/quarantined groups.

Same-UID malicious changes, TOCTOU races, mount replacement, arbitrary concurrent
deleters, privileged bypass, OS reboot and power loss remain unqualified. There
is no deletion lock against concurrent callers. Exact non-prefix absence is
refused in code but not separately fault-injected in this cohort. Symlink/hardlink
and xattr checks do not establish a hostile-filesystem boundary. Intent/fsync and
unlink failures at every possible instruction, caller-token loss and progress
after final record loss need separate handling if that recovery scope is required.
Loss of the caller copy does not make partial state eligible for automatic review.

The completion witnesses describe the original observed processes, not freshly
reopened pidfds during deletion. Source hashes assume repository integrity and
are not independent signatures. P1/P2 remain OPEN, A1 BLOCKED and Phase 1 HOLD.
The already-authorized provider inquiry and native route eligibility remain open.

## Evidence and offline verification

Full review tokens, manifests, paths, identities, marker bytes, helper outputs and
lifecycle records remain inside protected Windows evidence. Public output is
constructed from case names, selected booleans, scope limits and the source
fingerprint. Three offline tests reject missing review persistence/removal or
refusal witnesses, private-field injection, missing cases and admission promotion.

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/launcher-deletion/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/launcher-deletion -p test_results.py -v
```

Default verification checks saved source/artifact hashes and selected schemas;
it does not replay private evidence. `--develop` creates fresh test groups and
selected `.git` output. `--capture` requires report/review and refuses an existing
input file. Both live modes intentionally exercise deletion on those new fixtures.
`--native` refuses before setup. `.git` exclusion does not itself confer local
privacy; raw evidence is stored by the protected allocator.

The recorded Gemini exclusion remains in force. Luna and GLM completed; fallback
was unnecessary. Development delegation is separate from the managed mock runs.
See [review](review.json), [results](observations.json), [evidence](evidence.json)
and [next step](NEXT-STEP.md).
