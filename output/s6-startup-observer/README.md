# Startup observer implementation and synthetic Linux qualification

20 October 2026

Implemented the filesystem observer needed to inspect a future initialize-only
startup. Four tests run against real Ubuntu files and fixed Python child processes;
two additional publication tests reject evidence drift and native-scope promotion.
The installed Codex candidate is not launched by this cohort.

**Native execution and U0 admission remain disabled.** L1/L2 remain PARTIAL,
P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD. This cohort qualifies the observer against
controlled fixtures, not Codex's actual startup or effective configuration.

## Implemented observations

`RuntimeRoot` creates an exclusive UID-1000 root and sibling 0700 `home`,
`codex-home` and `tmp` directories. A 0600 retention record starts uncertain with
automatic deletion disabled. Root directories are retained after the tests;
closing the observer releases its descriptor without removing runtime data.

Snapshots traverse held directory descriptors without following links. The
allowlist covers the base directories, retention record, expected helper parents
and at most one `codex-arg0`-prefixed session. Only the four previously reviewed
alias names and an empty regular `.lock` can occupy that session. Exact target
strings, ownership, permissions and file link counts are checked. Frozen helper
validation is reused, with session/root identity checks around its path-based
entry. Concurrent hostile same-account mutation is not qualified by those checks.

Unknown names, dotenv/auth/config files and unexpected links are refused before
their contents are opened. Snapshots inspect metadata and allowed alias targets;
they do not read credential/configuration contents. Limits are 64 nodes, six path
components, 64 KiB per allowed regular file and 128 KiB combined regular-file and
symlink-target content. These are detective snapshot bounds, not filesystem
quotas or enforcement of native writes between snapshots. An unexpected tree is
retained for review, never silently accepted or automatically purged.

The process fixture receives exactly the five proposed Linux environment keys.
Its parent holds a pidfd, executable descriptor and start identity, checking the
executable device/inode and liveness before and after the active snapshot. Only
the directly launched fixed child is inspected. This is direct-process evidence,
not proof that an arbitrary descendant tree is empty.

The child deliberately changes its own PATH after exec. The observer still treats
`/proc/<pid>/environ` as a launch-environment snapshot. It does **not** use that
snapshot to claim the effective PATH after runtime environment changes. Native
PATH/configuration, credential discovery and network behavior remain unobserved.

## Tested cases

| Case | Actual result checked |
| --- | --- |
| Normal startup and exit | Empty helper inventory before start, exact helper set while the held child is live, aliases removed by the child on a fixed close command, zero exit and signaled pidfd afterward |
| Interrupted startup | Signal sent through the held pidfd after the complete helper set is ready; child exits by SIGKILL and its helper aliases remain retained for unknown-outcome review |
| Forbidden names/links | Synthetic dotenv, auth, config and unknown-link entries are rejected without target traversal |
| Metadata growth/permissions | A real oversized retention file and incorrect file permissions reject the snapshot |

The interruption test occurs after readiness; it does not qualify partially
created aliases, blocked spawn, collector loss or durable restart recovery. The
retention record remains uncertain, and there is no automatic retry path. Tests
remove only their deliberately introduced forbidden-entry probes and mutations;
interrupted helper state and runtime roots are retained.

## Verification and evidence

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/startup-observer/run_windows.py
rtk proxy python -B -O -X utf8 feasibility/s6-wsl/startup-observer/run_windows.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/startup-observer -p test_publication.py -v
rtk proxy python -B -X utf8 feasibility/s6-wsl/startup-observer/check.py
```

The four Ubuntu observer tests pass with the Windows harness and Linux observer
in normal and optimized modes. The fixed child remains `-I -S -B` in both; its
execution under `-O` is not separately qualified. Two offline publication tests
also pass normally and optimized. The prior native-inventory, scheduled-WSL and
native-contract checks remain valid.

The Windows harness sends a bounded hash-bound source bundle, checks that it did
not change during the run, and drains diagnostics in fixed chunks through the
existing protected charge-before-write store. The selected report has an 8 KiB
cap. Raw runtime paths stay in protected LOCALAPPDATA diagnostics; public
[observations](observations.json) contain only closed verdict fields. Private
Linux roots remain 0700. The [manifest](evidence.json) binds source/artifact and
prior evidence hashes; hashes are local consistency checks, not attestation.

This harness has a separate 45-second process wait and explicit reader teardown.
It is not yet connected to the shared-deadline native launch composition.
Blocked I/O, hostile replacement, process-tree escape, collector loss, storage
failure and suspend/resume remain unqualified. The observer cannot revoke same
account filesystem/network authority or prove absence of transient writes.

Luna completed a supplied-context design review. GLM and DeepSeek both timed out;
no successful review is claimed for either. Parent code, test and documentation
guard passes are recorded in [review](review.json). Historical cohorts are intact.

**Next:** connect this observer to the supervised initialize-only startup
composition, define its actual native write inventory and final PATH/config
observation method, and review the exact source/binary/input binding for U0.
This result does not grant that admission or authorize authenticated model calls.
