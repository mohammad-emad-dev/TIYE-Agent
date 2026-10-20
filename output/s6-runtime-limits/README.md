# S6 designated-filesystem limits

Four fixed Linux fixtures passed on Ubuntu under WSL. Each used a fresh private
user/mount namespace and a fresh tmpfs with a 2 MiB capacity and 64 inodes.
The supervisor retained namespace capabilities for mount setup and plain unmount.
The executed Python fixture had zero inherited, permitted, effective, bounding
and ambient capabilities and `NoNewPrivs=1`.

| Fixture | Observed acceptance condition |
| --- | --- |
| File boundary | A crossing write stopped at 65,536 bytes; the next write and `ftruncate(65537)` failed with `EFBIG` |
| Byte exhaustion | Bounded writes failed with `ENOSPC`; available blocks were zero while inodes remained |
| Inode exhaustion | Empty-file creation failed with `ENOSPC`; available inodes were zero while blocks remained |
| Privilege refusal | Raising the hard file limit and resizing this mount failed; direct execution from it failed with `EACCES` |

Every fixture checked its namespace, mounted mode, capacities, file/core limits
and post-exec privilege state. Every supervisor reaped its fixed child and
completed ordinary unmount, revealing the original empty directory identity.
The outer process verified that its mount namespace identity was unchanged and
that the fixture path was not a mount in its view before or after each case.
These checks do not compare the entire host mount table.

## Scope and remaining integration

This qualifies fixed disposable fixtures on the designated filesystem. Other
host paths remain reachable. Nested user/mount namespaces can provide another
filesystem; these tests do not forbid them. There is no process-total disk or
RSS cap and no general sandbox claim. `noexec` was checked with direct execution;
it does not prohibit an interpreter from reading a script.

The hard `RLIMIT_FSIZE` was 64 KiB and the core limit was zero. The file fixture
verified write and truncate behavior only; other allocation mechanisms were not
qualified. The tmpfs capacity is filesystem accounting, not a RAM-only promise.
See the [Linux tmpfs documentation](https://docs.kernel.org/filesystems/tmpfs.html),
[resource limit contract](https://man7.org/linux/man-pages/man2/getrlimit.2.html)
and [privilege launcher contract](https://man7.org/linux/man-pages/man1/setpriv.1.html).

Unmount deliberately discards **known synthetic test bytes**. It does not qualify
unknown native-state retention. Before native integration, retain a namespace or
held mount reference until evidence is copied or quarantined. An outside observer
also needs a reviewed way to access that private mount, such as a transferred
directory descriptor. Its existing host path and UID assumptions are insufficient.

This standalone harness is not composed with the existing shared deadline,
systemd service, pidfd observer or Windows Job. Its subprocess timeouts and
private bounded Windows capture do not qualify arbitrary process-tree cleanup.
Linux subprocess report buffering is for fixed fixtures only, not untrusted RPC.
Raw failure diagnostics remain in protected local capture storage. Only selected
verdicts and hashes are published. Hashes detect local drift, not build provenance.

## Configuration and PATH

[The C0 plan](config-observation-plan.json) binds `config/read` to saved Codex
0.157.1 parameter/response schemas. C0 would be a separately admitted observation
after its own initialization. No version field is added to the wire request and
the existing U0 two-packet contract is unchanged. The request omits optional `cwd`;
the future launch must use a fresh exclusive working directory.

The saved response schema exposes configuration, origins and optional layers.
It can represent `config.analytics.enabled`. It does not directly establish
feedback disabling, credential-store choice, network/authentication inactivity
or final process PATH. Layer contents may contain sensitive values and paths;
future responses must stay private and yield only allowlisted verdicts after
bounded framing and schema validation. That response validator is not implemented.

`/proc/PID/environ` cannot establish the modified final PATH. A separately
authorized inherited-environment witness or another source-reviewed mechanism
is still needed. No C0 request or native candidate was executed by this task.

Native execution/admission remain disabled. L1/L2 remain PARTIAL, P1/P2 OPEN,
A1 BLOCKED and Phase 1 HOLD.

## Verification

From the project root on the qualified Windows/Ubuntu setup:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/runtime-limits/check.py
```

This checks saved source/schema/artifact hashes, four case records and rejection
of permission promotion, an incomplete case set and failed unmount verification.
Add `--develop` only to execute the four fixed fixtures again. A failed run raises
an error and records a private diagnostic locator in `.git`; it does not publish
or promote results. Normal Windows Python and `-O` were checked; the Linux
fixtures use isolated Python `-I -S -B` without `-O`.

Next: integrate the private mount with supervised lifecycle and retained evidence,
then implement the separate C0 response validator and resolve final-PATH observation.
