# S6 custody checks when shutdown evidence is unavailable

The supervised keeper now supports an authenticated read-only custody probe
that works without a valid terminal file or published unknown receipt. It
checks the live held mount and exact fixed inventory without granting release,
successful retention, retry or native execution.

## Implemented change

The existing keeper request loop accepts `probe-custody` from its original live
observer. The request requires the exact event/nonce schema and the original
observer's peer credentials, full identity and unsignaled pidfd. Authority is
checked before and after inventory inspection. The reply binds the keeper,
mount identity and inventory digest and explicitly preserves an unknown result.
It does not change enrollment or release authority and transfers no descriptor.

The probe runs through the same synchronous keeper request loop as enrollment
and release. It uses the held mount descriptor and checks a stable exact fixed
inventory. Receipt publication is not a prerequisite for this diagnostic.

The existing shutdown path already holds custody when terminal validation or
receipt publication fails. This cohort exercises that path rather than relaxing
its terminal verifier. A verified unknown receipt is reported separately from
verified live custody; the receipt-blocked case receives no receipt credit.

## Controlled live faults

All cases use the actual Windows guardian Job, Ubuntu systemd service, original
held process handles/pidfds and independent keeper. The observer waits for the
worker pidfds to signal and its service cgroup to empty, then validates real
normal terminal evidence before injecting a fault and sending keeper `finish`.

| Fault | Real filesystem operation | Selected result |
| --- | --- | --- |
| Missing terminal | Unlink the validated terminal file after worker exit | Terminal absent and custody held; unknown receipt verified |
| Invalid terminal | Truncate the validated terminal file after worker exit | Terminal invalid and custody held; unknown receipt verified |
| Blocked receipt | Truncate terminal and exclusively create an empty receipt at the keeper's exact receipt name | Terminal invalid and custody held; receipt unverified |

Terminal operations are relative to the pinned service evidence directory.
Receipt operations use a separately checked keeper receipt directory and its
original device/inode identity. Mount custody uses the transferred private mount
descriptor. These are distinct directories. The blocked receipt's original file
stamp and empty bytes remain unchanged after the keeper reaches its hold loop.
The invalid receipt is rejected by the existing receipt verifier.

These faults model loss or corruption of existing evidence. They do not simulate
worker failure before terminal creation, hardware storage faults or arbitrary
receipt I/O errors. The earlier symlink-collision proposal was replaced by the
explicit post-exit unlink/truncate operations above. The exact historical
missing-terminal incident remains unattributed.

## Verification

Five tests passed in both normal and optimized Windows host Python: three live
fault scenarios and two boundary tests. Each live case independently verifies
the keeper and exact inventory before and after closing the observer's duplicate
mount descriptor. A wrong-nonce custody request is refused, followed by another
successful bound probe. The keeper's original pidfd remains unsignaled.

Boundary tests reject substituted mount/invocation bindings, permission
promotion, receipt credit without a receipt, invalid custody digests and disposal
before a settled unknown result. Public evidence requires the exact three-case
matrix and unchanged verdicts after explicit fixture disposal.

Generic session closure remains refused while custody is held. Explicit isolated
test teardown uses the original keeper pidfd and a strictly identified synthetic
sentinel. All selected outcomes remain unknown afterwards; teardown grants no
cleanup, automatic deletion, retry or native admission credit. Diagnostic files
remain retained. Linux final-inventory/accounting completion is deliberately
unverified because terminal evidence has been removed or corrupted; no success
audit record is manufactured or evidence restored.

```powershell
rtk proxy python -B feasibility/s6-wsl/uncertain-shutdown/check.py
rtk proxy python -O -B feasibility/s6-wsl/uncertain-shutdown/check.py
```

Run from the project root on the existing Windows/Ubuntu setup. The default
checks saved source/artifact/reference hashes, generated runtime equality and
the closed verdict schema. Add `--develop` for the five live tests. Live runs
also refuse stale generated source. Linux runs with `-I -S -B`; Linux optimization
is unqualified. Earlier sealed cohorts are unchanged.

The packed runtime remains below its 128 KiB decompressed limit and 64 KiB
transport envelope. The existing one-second lease, five-second Windows deadline,
service limits and Windows capture budgets remain unchanged. Final byte counts
do not establish a lifetime quota on all writes. Public output contains selected
verdicts/timings/hashes; raw identities, runtime paths and diagnostics remain
protected locally. Hashes detect drift without signed provenance.

## Review and remaining work

GPT-6 Luna at max completed a supplied-design review. Its descriptor and fault
timing concerns were checked against the actual evidence/mount layout. The
parent implemented and reviewed the final code. GLM-5.3-Flash Free at max and
DeepSeek V4.1 Flash Free at max failed without final findings. No substitute
model was used and no external final-code audit is claimed.

Next: connect uncertain shutdown custody to the existing recovery enrollment
flow and test observer loss after these faults. In particular, an invalid
unknown receipt currently prevents receipt-backed enrollment; the read-only
probe does not bypass that restriction. Receipt-channel failures, keeper loss,
reboot recovery and hostile same-UID behavior remain unqualified. No candidate
or provider-backed application execution occurred in these fixtures.

Native execution/admission remain disabled. L1/L2 remain PARTIAL, P1/P2 OPEN,
A1 BLOCKED and Phase 1 HOLD. C0 configuration and final-PATH observation remain
separate pending work.
