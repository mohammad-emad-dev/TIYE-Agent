# U0 launcher implementation — 17 October 2026

The first launcher implementation is in
[`feasibility/s6-wsl/codex-u0/`](../../feasibility/s6-wsl/codex-u0/).
**Native admission has not been granted. No WSL or Linux Codex process was
launched in this task.** The saved tests use Windows Python synthetic children.
This is implementation evidence, not a completed U0 qualification cohort.

## Implemented behavior

- Default invocation checks local source syntax and the saved candidate baseline
  without starting another process. Native capture additionally requires
  `--capture` and a separately reviewed, source-bound admission file; none exists
  for this implementation.
- The host snapshots source bytes, records their hashes and input manifest before
  spawning, uses an absolute Windows system WSL executable and explicit host/Linux
  environment allowlists, and keeps raw streams privately under `.git/tiye-u0/`.
- The Linux worker checks non-root UID 1000, the pinned executable hash and pidfd
  availability. It creates fresh private runtime directories and sends only
  `initialize` and, after a valid correlated response, `initialized`.
- Incremental UTF-8 JSONL framing rejects duplicate keys, non-finite numbers,
  foreign/duplicate/error responses, oversized records and incomplete EOF.
  Late duplicate responses remain failures after the notification is sent.
- Concurrent readers retain bounded prefixes and drain/discard after a fault.
  Writes distinguish attempts from local drain; only the synthetic test peer
  independently acknowledges observing the second packet.
- Cleanup attempts stdin EOF, then identity-bound Linux pidfd TERM/KILL. The host
  can signal its owned Windows launcher; its death is never treated as Linux
  death. A persistent native-launch lock is deliberately never auto-cleared.
- Native protocol observation requires a matching handshake, both locally drained
  writes, unchanged binary, zero exit, direct-child reap and observed EOF on both
  streams. This still cannot qualify tree cleanup or product access.

## Verification

The final saved run passed **13 tests**, covering real synthetic pipe traffic,
Unicode fragmentation, late duplicates, foreign/truncated records, bounded
stdout/stderr retention, continued drain after protocol failure, escalation,
admission invalidation and native-result validation. Test fixture deadlines are
shorter than the proposed native limits and are not vendor measurements.
Tests were rerun during development; the artifacts here contain the final run.

Run from the project root in PowerShell:

```powershell
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/codex-u0 -p test_u0.py -v
rtk proxy python -B -X utf8 feasibility/s6-wsl/codex-u0/run.py
rtk proxy python -B -X utf8 feasibility/s6-wsl/codex-u0/check.py
```

The first command reruns synthetic tests; the second is an offline source check;
the third checks only saved hashes and results. None launches WSL or a provider.

## Remaining native-admission work

The worker always records Linux tree cleanup and ambient credential access as
**unverified**. It signals only the directly recorded identity, not descendants.
The environment and fresh directories are not filesystem or network containment.
No claim is made that the CLI cannot access other readable files or services.

Async deadlines bound normal awaited phases. Synchronous OS process creation,
file hashing, interpreter teardown and filesystem operations do not yet have an
independent hard watchdog. Spawn cancellation can leave ownership uncertain.
The current code is therefore **not admitted for native execution**. Establish
the outer watchdog, Linux ownership/recovery observation and ambient-access
review before issuing an admission record. The admission booleans are an operator
review record, not a security boundary against a malicious local operator.

The private host directory uses inherited Windows filesystem permissions; Git
exclusion is not an ACL or encryption guarantee. Private raw evidence needs its
own access/privacy review before any native capture. Linux runtime fixtures are
intentionally retained; recursive deletion is not part of the protocol.

The later authenticated cases still require the applicable provider route and
their own exact wire contracts. [OpenAI's inquiry receipt](../s4-codex-outreach/README.md)
is not approval. S4/S6 remain partial and Phase 1 remains **HOLD**.

## Review scope

Codex's implementation session reported policy-rejected filesystem access and
produced no code; the parent implemented this change. Muse reviewed the supplied
design and an earlier code snapshot. Space Bunny was attempted as a code-review
fallback. Further outcomes and parent dispositions are recorded in `review.json`.
Delegated advice is not independent workspace or native-runtime verification.
The parent applied Test Guard to the synthetic tests and checked the final code,
commands, local links and saved evidence.
