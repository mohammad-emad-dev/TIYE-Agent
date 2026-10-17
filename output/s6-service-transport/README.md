# Managed Linux mock protocol integration

17 October 2026. Three real Ubuntu process tests compose the U0 protocol
transport with the previously measured transient user-service lifecycle.
This is a mock integration checkpoint for TIYE's launcher. No provider binary,
authentication, model request or native admission is involved. Phase 1 remains HOLD.

## What the capture establishes

Windows sends a hash-verified fixed source bundle into Ubuntu. The test observer
launches a uniquely named transient service through the existing UID-1000 user
manager. Inside that service, a worker runs the asyncio protocol transport against
a fixed Python peer. asyncio owns and reaps that direct child; the service manager
owns the worker and its cgroup. A separate-session TERM-ignoring leaf tests the
manager's cleanup independently of protocol completion.

| Case | Protocol observation | Lifecycle observation |
| --- | --- | --- |
| Valid response then worker exit | Correlated initialize response permits exactly one initialized notification; peer records receipt and stdin EOF shutdown | Main status 0; remaining stubborn leaf removed; unit Result=timeout preserves cleanup escalation |
| Valid response then worker crash | Same completed protocol exchange | Observer SIGKILLs main through its held pidfd; manager removes leaf; Result=signal and main status 9 |
| Foreign response then worker exit | Wrong response ID is rejected; only initial request is written and no notification marker appears | Main exits 0 after recording rejection; manager removes leaf; Result=timeout |

Both original main/leaf pidfds must signal, both original process entries must
disappear, and the original cgroup must be removed or populated 0 before teardown.
An unrelated sentinel outside the unit remains live. Before intervention the
observer checks start ticks, nonce, main PID, leaf parentage and separate sessions.
The protocol child's cgroup and UID are also recorded at spawn. Cleanup is observed
within five seconds of the release/crash action; the leaf's fallback is 15 seconds.

## Compatibility defect found and corrected

The initial development run failed all three cases with
`stdin-abort:AttributeError`. The inherited transport called the low-level pipe
abort path after closure. Installed CPython 3.14.4 source inspection showed that
path attempts to use a loop reference already cleared during connection teardown.
The new candidate uses `StreamWriter.close()` followed by a deadline-bounded
`wait_closed()` instead, following the documented
[stream closure API](https://docs.python.org/3.14/library/asyncio-stream.html#asyncio.StreamWriter.wait_closed).
Closure errors remain failures. No assertion was relaxed to accept this error.

The [development failure diagnostic](development-failure.json) retains the failed
test log, source hashes and raw-output hash. It is a diagnostic excerpt, not a
reproducible frozen source cohort. The original U0 transport and earlier captures
remain unchanged. This cohort freezes the corrected candidate.

## Review and reproduction

From the repository root, check saved hashes and observations without starting WSL:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/service-transport/run.py
```

`--develop` runs fixed fixtures with new private evidence under `.git`.
`--capture` requires this report and review provenance and refuses an existing
input record. The seven-file Linux bundle is bounded to 64 KiB of encoded input;
the test subprocess limit is 25 seconds and the WSL host limit is 35 seconds.
All source files, including the host runner and offline validator, are hashed.
Runtime directories use umask 077 and remain available for inspection.

[Input](input.json), [evidence](evidence.json), [raw stdout](wsl.stdout.bin),
[raw stderr](wsl.stderr.bin) and [review dispositions](review.json) record the run.
Codex supplied the initial worker draft. Parent review corrected its notification
format, file layout, environment and cleanup handling before the final capture.
Muse was unavailable. DeepSeek returned a design review, not a final-source review.

## Limits and next exit criterion

Service stdout/stderr remain null; protocol bytes are exchanged inside Linux and
returned in the result artifact. This does not qualify live Windows-to-agent
stream forwarding. The worker crash occurs **after** the protocol child has been
reaped. Crash during handshake, simultaneous Stop, blocked writes, concurrent
instances, Windows-owner failure through this candidate, manager failure and
distribution shutdown remain untested here. A user-service cgroup is not a
credential, network or filesystem security boundary. Query-then-control remains
non-atomic and hostile same-user cgroup migration is outside this evidence.

The next integration exit criterion is to observe cancellation/crash while the
mock protocol child is still live, with independent process witnesses, then bind
the result to the Windows supervisor before considering unauthenticated native
admission. Capture/privacy and ambient-access review remain required. Authenticated
provider work also requires its applicable route eligibility. This checkpoint
does not establish a finished desktop application or completed S4/S6 qualification.
