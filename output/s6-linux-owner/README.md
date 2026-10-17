# Linux ownership component — controlled orphan adoption

17 October 2026. This step addresses TIYE's Stop and cleanup requirements when
an agent root exits but leaves a child in a separate Linux session. It adds a
dedicated single-threaded Linux subreaper component and four controlled Ubuntu
process tests. **It grants no native provider admission and does not close S6.**

## Implemented boundary

[`Owner`](../../feasibility/s6-wsl/linux-owner/owner.py) starts one root and tracks
only its dedicated supervisor's direct children, including descendants adopted
after their parent exits. It records PID, start ticks, UID and boot-ID hash and
holds pidfds. The boot-ID digest hashes the stripped contents of the kernel's
`boot_id` file. All still-live recorded identities are validated before any requested
signal is sent. Owner cleanup uses pidfds, never numeric-PID kill or process-group kill.
The supervisor reaps the owned processes and preserves the original root exit.

The owner requires Linux UID 1000, default SIGCHLD disposition, a single thread
and no pre-existing children. These are current fixture constraints, not general
requirements for every future TIYE installation. A later reused reaped PID is
refused. The empty check rechecks the kernel's direct-child list after the sweep
so a root reap cannot itself hide a newly visible adoption.

The implementation follows the documented Linux
[subreaper adoption behavior](https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html)
and [pidfd ownership and exit observation semantics](https://man7.org/linux/man-pages/man2/pidfd_open.2.html).
Those semantics are not a promise of containment for arbitrary provider trees.

## Four measured cases

| Case | Required independent observation |
| --- | --- |
| Normal exit | Root exits 0 and is reaped without sending a cleanup signal |
| Orphan adoption | Root exits 7; its setsid child remains live and becomes the supervisor's direct child; pidfd TERM stops it and root exit 7 remains recorded |
| Escalation | Adopted child ignores TERM; pidfd KILL is required and its reaped exit is -9 |
| Identity mismatch | Two adopted children remain live after the last expected identity is altered and the signal call refuses; original expectations are then restored for the separately observed cleanup |

An unrelated sibling sentinel remains live in every case. The observer opens
its own pidfds and checks each child's start time and nonce before intervention.
It verifies the separate session, changed parent, exit readiness and final `/proc`
absence for the known descendants. Root completion is observed before cleanup.
The mismatch case checks both real child pidfds before allowing cleanup, rather
than treating a hardcoded zero-signal count as evidence.
The observer separately stops its own sentinel and supervisor `Popen` instances
during teardown; that is not the owner's pidfd cleanup path.

Fixtures expire after 10 seconds as a failure backstop. Passing supervisor cases
must finish in under 5 seconds; expiry is not an accepted cleanup mechanism.
Linux runtime roots are retained under marker-owned private `/tmp` directories.
No recursive deletion, distribution shutdown, provider CLI, credential access,
installation or network configuration change is part of the fixture.

## Reproduce and verify

From the project root on native Windows, verify only saved artifacts:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/linux-owner/run.py
```

The default does not launch WSL. The host runner's `--develop` option starts a new
fixed mock cohort with evidence in a fresh private `.git` subdirectory. Its
`--capture` option requires this README and `review.json`, then refuses an existing
`input.json`. The public capture is frozen; do not overwrite it to rerun tests.

The host selects Ubuntu explicitly and sends a bounded source bundle over stdin.
The Linux bootstrap verifies bundle hashes, creates a fresh mode-0700 directory
under umask 077 and writes only four fixed source filenames. Both host and Linux
environments are explicit allowlists. Linux tests have a 25-second outer timeout;
the WSL host command has 35 seconds. These are normal awaited bounds; a host
timeout cannot establish Linux death and must remain a failed capture.

The [input manifest](input.json) records source hashes and launch bounds.
[Raw WSL stdout](wsl.stdout.bin) contains the bootstrap envelope and base64-encoded
test output; [raw stderr](wsl.stderr.bin) is retained separately. The
[evidence manifest](evidence.json) binds public artifact hashes and host results.
The offline checker decodes the raw output and validates the four case outcomes.
Exact Linux and Python versions are recorded in that bootstrap envelope.

## Exit condition and remaining work

This closes the controlled orphan-adoption, identity-refusal and TERM/KILL
escalation check for the new component on the recorded Ubuntu host. It does not
prove arbitrary tree containment, abrupt supervisor-death cleanup, concurrent
recovery, hostile namespace or `/proc` behavior, fork storms, reboot recovery or
hard bounds on OS operations. Snapshot discovery and a live-count receipt alone
are not sufficient proof of general process-tree death.

The component is not wired into the native U0 Linux worker. A separate native
integration must establish who survives an owner crash and how recovery verifies
the remaining identities. Private capture access and ambient credential review
also remain before unauthenticated U0 admission. Authenticated tests additionally
require the qualified provider route. S4/S6 remain partial and Phase 1 stays HOLD.

[Delegation provenance](review.json) separates Codex generation, unavailable Muse,
the authorized DeepSeek fallback attempt and parent verification. DeepSeek exited
without review text; no independent completed code review is claimed.
