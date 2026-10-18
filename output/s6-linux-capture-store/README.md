# Linux synthetic capture privacy and retention

18 October 2026 · **9 live Linux cases · P2 OPEN · Native admission BLOCKED**

This new storage prototype addresses Linux portions of the admission package's
privacy gap. It creates only owned synthetic fixtures in Ubuntu. Historical
runtime bundles and captures are untouched. It is separate from both mock
launcher cohorts and is not integrated with a native provider or launcher.

## Implemented storage contract

A nonroot owner creates a UUID-named capture directory with mode 0700 beneath an
owned parent directory descriptor. Fixed capture files are created exclusively
with mode 0600 and no-follow opens. Reads verify owner, regular-file type, single
link, exact mode, size, and absence of extended attributes. Directory descriptors
pin traversal from the supplied parent; caller selection of that parent remains
a trusted input. Directory identity and file metadata/hashes are rechecked.
Directory verification also rejects extended attributes, including extended ACLs.
This is an explicit unsupported-input refusal, not a general ACL implementation.

Only `retention.json`, `stdout.bin`, `stderr.bin`, `completion.json` and
`deletion.json` are accepted. Payloads have a 64 KiB per-file limit and a 96 KiB
aggregate limit, checked before exclusive creation. These are API payload budgets,
not a filesystem quota, external-writer control or ENOSPC guarantee. Metadata is
separate and bounded by the prototype's read limit. Partial writes set a fault
and prevent sealing. A real RLIMIT_FSIZE-induced partial write exercises this
path; disk-full and arbitrary I/O failure recovery remain unqualified.

`seal()` records the identities and SHA-256 hashes of both payloads and retention
only after their synchronous writes, fsyncs and descriptor closures finish.
It closes the write transaction. Its scope is **synchronous storage only**:
it asserts no process-tree exit, protocol completion or provider-task success.
Reopened transactions cannot write or seal. Failed or incomplete transactions
remain uncertain and cannot use the reviewed deletion path.

## Reviewed deletion and bounded recovery

`review()` returns the validated completion digest. The caller must retain and
explicitly supply that digest to `delete_reviewed()` and consume its progress
iterator. The operation rejects unexpected entries, links, metadata/content
changes and changed completion. It writes and fsyncs an explicit deletion intent
before removing anything. Payloads are unlinked first, then completion, retention
and intent, followed by a nonrecursive rmdir; directory changes are fsynced.

A separate worker exits after the first payload unlink. Another owner worker
reopens the same run and resumes using the original review digest and persisted
intent, rechecking every remaining file. Missing payloads are accepted only on
that resume path. This is a measured process-boundary interruption, not a
power-loss or forced-kill durability qualification.

The final metadata window is deliberately narrower: a second interruption after
completion removal leaves retention and intent. Automatic resume refuses that
state and leaves it quarantined. There is no general recovery promise, automatic
expiry, secure erase, backup deletion or reclamation of historical captures.
The successful deletion case verifies the run directory is actually absent.
Refusal and uncertainty fixtures remain retained for review.

## Effective access and test scope

The root-only test supervisor exists solely to fork numeric-UID fixture workers.
It clears supplementary groups and inherited nonstandard descriptors before
switching GID/UID. No account is created and no credentials are inspected.
The storage implementation itself refuses root ownership. The parent fixture
directory is deliberately traversable so denial does not come from a hidden
ancestor. The supervisor performs no provider or network operation.

An ordinary alternate UID with matching real/effective/saved/filesystem UID/GID,
no supplementary groups and zero effective capabilities actually attempts opens.
It receives EACCES for a file below the 0700 run directory. The owner then makes
that directory temporarily traversable, and the alternate UID is independently
denied by the 0600 file. The owner restores 0700 and successfully reads the file.
These are real Linux DAC observations, not inferred ACL results. They do not test
a Windows alternate token, privileged bypass, same-UID isolation or other systems.

| Live case | Required outcome |
| --- | --- |
| Directory and file access | Alternate UID denied in both configurations; owner reads successfully |
| Payload bounds | Exact file/aggregate limits accepted; one-byte excess refused before creation; late writes refused |
| Uncertain capture | No completion means no deletion; files preserved |
| Reviewed deletion | Payload and metadata removed; run directory absent |
| Invalid entries | Unknown file, symlink, hardlink, mode drift and user xattr each refuse before deletion intent |
| Review/content drift | Wrong review digest and equal-size content mutation refuse without deleting payloads |
| Payload interruption | First payload removed by one worker; another reopens and completes reviewed deletion |
| Metadata interruption | Missing completion quarantines remaining retention/intent |
| Partial write | Real eight-byte partial write followed by EFBIG; sealing refused |

Same-account malicious mutation and verification/unlink races are not solved by
dirfds. Root can bypass ordinary permissions. Hostile parent replacement,
unexpected ACL variants, forced kills at every syscall, reboot/power loss,
storage exhaustion, concurrency and repeated resource exhaustion are unqualified.
This prototype does not close P2, establish credential isolation or alter the
documented shared-account access contract.

## Evidence and publication

The Windows runner binds all four new Python files and the two immutable Windows
allocator modules it actually imports. The Linux bundle is hash checked before
its two modules are loaded. The code bundle is removed after the tests; synthetic
test captures remain in Ubuntu. Raw Linux report, paths, numeric identities and
complete unittest log are retained in a newly protected Windows capture allocated
before the Linux process. No raw evidence is exported to GitHub.

Public output is newly constructed from selected case names and fixed scope
limits. Three offline publication tests check private-field omission, failed or
mismatched bundle refusal, and scope/admission promotion refusal. Saved hashes
detect drift under repository integrity assumptions; they are not signatures and
do not independently replay private evidence. Default verification is offline.

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/linux-capture-store/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/linux-capture-store -p test_publication.py -v
```

`--develop` creates a new fixture and selected output under `.git`.
`--capture` requires this report/review and refuses an existing input file.
`--native` refuses before running fixtures. Live operation requires native Windows,
WSL Ubuntu with Python and a root supervisor; it does not require provider login.
It retains synthetic Linux fixtures and a private Windows capture. The raw Windows
store uses the previous prototype's fixed 64 KiB file limit; this runner's timeout
and capture buffering are not a general streaming quota implementation.

GPT-6 Luna max and GLM-5.3-Flash Free max supplied reply-only design reviews;
neither reviewed final source nor ran tests. We adopted descriptor hygiene,
durability ordering, actual identity denial and explicit recovery limits. We did
not adopt GLM's unsupported nosuid/noexec or locale-dependence claims. Gemini was
not dispatched under the recorded route exclusion; fallback was unnecessary.
Development delegation remains distinct from this synthetic qualification.

See [evidence](evidence.json), [observations](observations.json),
[selected test results](tests.log), [review](review.json) and [next step](NEXT-STEP.md).
