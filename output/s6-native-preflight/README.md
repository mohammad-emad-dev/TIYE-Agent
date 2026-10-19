# Pinned candidate review and native resource policy

19 October 2026 · **44 listed package files rehashed / 8 policy tests passed**

The pinned Linux Codex candidate and packaged helpers still match the saved
inventory. The read-only inspection did not execute Codex, request auth status,
inspect account files or query a keyring. It read only the explicitly listed
package files through no-follow descriptors, checking regular-file type, owner,
single-link metadata, stable size/timestamps and content digests. It did not scan
for unlisted files or establish the absence of ambient credentials. Raw diagnostics
remain in protected Windows storage; [inspection](inspection.json) publishes only
selected scope/count booleans.

Native startup, login, model access and native admission remain unqualified.
L1/L2 are PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD.

## Version-specific source evidence

The upstream annotated `rust-v0.157.1` tag object
`ac0e23e5232692b95268583c8278c50b8c436d2b` resolves to commit
`36650394c5b38c2990ccf2a3457165ca3e9d9726`. Twelve selected public source files
were fetched by that exact commit, cached outside Git publication and hashed in
[findings](findings.json). The initial raw lookup used the annotated tag object
as a commit and returned 404; resolving its commit supplied the inspected files.
This associates reviewed source with the release tag. It is not a signature,
reproducible-build result or proof that the installed binary was built from it.

| Surface | Pinned-source finding | Consequence for U0 |
| --- | --- | --- |
| Helper setup | [arg0 startup](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/arg0/src/lib.rs#L341) creates CODEX_HOME-scoped helper aliases, can run stale-alias cleanup and changes PATH before app main | An initial five-key environment is not the final effective PATH or a fixed empty runtime inventory |
| Temporary root check | The same source refuses helper creation when CODEX_HOME starts with the process temporary directory, then warns and continues | Sibling CODEX_HOME/TMPDIR paths avoid only that lexical branch by source reasoning; no runtime/helper qualification follows |
| Configuration layers | [Config loader](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/config/src/loader/mod.rs#L209) considers cloud/managed requirements and system configuration as well as user/project sources | Fresh HOME does not remove `/etc/codex` or managed policy; do not bypass those policies |
| Authentication before RPC | [App-server startup](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/app-server/src/lib.rs#L521) constructs auth managers while loading startup/latest configuration | Sending only initialize does not establish that no credential discovery was attempted |
| Auth source selection | [Auth manager](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/login/src/auth/manager.rs#L1488) has distinct flag-gated CODEX_API_KEY, ephemeral, access-token and persistent-store paths; construction can collapse a load error into no managed auth | App-server's false API-key flag is not a universal auth disable switch; a missing login result is not proof of no attempt |
| Persistent storage | [Storage implementation](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/login/src/auth/storage.rs#L431) can select keyring/file storage and auto fallback | Review effective storage requirements before choosing a native U0 profile; no keyring/account file was inspected here |

The inspected app-server source also sets up environment and telemetry components.
This is selected-source analysis, not a complete transitive startup or network
audit. We establish neither network silence nor absence of helper subprocesses.
The prior version/help alias warning remains historical evidence, not a control.

Keep the existing unexpected-symlink quarantine. A native runtime policy must
individually qualify expected helper names, targets, ownership and lifecycle;
allowing arbitrary links would not resolve the issue. No environment, argv,
credential backend, machine policy or candidate installation was changed here.

Current official [configuration guidance](https://learn.chatgpt.com/docs/config-file/config-basic)
also describes multiple configuration layers, and
[authentication guidance](https://learn.chatgpt.com/docs/auth) describes file and
OS credential storage. These pages were fetched on 19 October as current context;
they do not substitute for this version-pinned analysis. No new provider-route
eligibility decision was made, and no inbox was accessed.

## One metadata budget across producers

The [policy module](../../feasibility/s6-wsl/native-preflight/policy.py) now supplies
a thread-safe charge-before-write ledger and a separate final-size audit. The
proposed allocation is explicit:

| Accounting owner | Allocation | Includes |
| --- | --- | --- |
| Controller | 512 KiB | Attempt/configuration/binding records, watchdog results, final evidence and audits |
| Stream | 128 KiB | Stream retention/completion metadata; raw stdout/stderr retain their separate 4 MiB/1 MiB limits |
| Observer/diagnostics | 256 KiB | Observer output/error, lease/watchdog diagnostics and other control-path output |
| Reserved, not writable | 128 KiB | Unallocated headroom requiring a separately reviewed allocation change |
| Total | 1 MiB | Every owned host byte outside the two raw protocol streams must have one accounting owner |

Charge exactly once at the lowest controlled persistence point before I/O.
Routing through two in-memory components does not justify charging one write
twice; writing a second persisted copy does. Replacements charge the entire new
write again. Failed/uncertain attempts never refund, so the ledger bounds gross
attempted writes conservatively and may exhaust before final files fill their
allocations. `audit_metadata_sizes()` separately checks observed final-file sizes.
Neither accounting path redeems or replaces the old 32 MiB post-run fixture audit.

This ledger is **not integrated** into the launcher or writer. Current writer
metadata still has its older 1 MiB component cap, and controller/observer files
still bypass a shared live ledger. The new 128 KiB stream allocation is proposed
for the next composition, not retroactive qualification. External/native runtime
writes and a filesystem quota remain separate concerns.

## One clock and explicit phase cutoffs

`NativeSchedule` takes a single host monotonic origin before spawn. Work phase
maxima are 30 seconds host startup, 15 child startup and 15 initialize, clipped
to T+60. Phase re-entry, clock regression, nonfinite times and advancing expired
work are refused. Cleanup revokes further work. On the first fault, cleanup gets
at most 15 seconds, clipped to T+75; EOF, TERM and KILL each get at most five.
Earlier cleanup does not reclaim the unused work window.

Observation gets at most 15 seconds, ending no later than T+90. T+75 is the final
cleanup-action cutoff. Observation may verify held identities/cgroup state and
close local endpoints; it does not authorize another task, fresh signals or
extending cleanup. Unknown ownership at the final cutoff blocks relaunch and
requires a separately recorded recovery decision. A late cleanup phase can have
zero remaining time. The caller must act on that refusal/expiry.

These are calculated wait windows, not a timer, watchdog or interruptible-I/O
implementation. They do not themselves stop a process or advance while a machine
is suspended in a platform-independent way. The old 60/75/90-second service,
transport and watchdog constants remain unchanged; cross-OS service/lease timing
must still be reconciled with this host schedule before native admission.

## Verification and next implementation

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/native-preflight/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/native-preflight -p test_policy.py -v
```

The first command checks saved scope, source/artifact/reference hashes and policy
constants offline. Optional `--source-cache <directory>` additionally rehashes
the twelve cached public source files without network access. `--inspect` performs
the bounded Windows/Ubuntu listed-package rehash again, retains protected raw
diagnostics and writes a fresh selected result under `.git`; it never executes
the candidate. No native/admission-generation mode exists.

Eight tests cover simultaneous producer overbooking, exact allocations and final
size refusal, unknown/invalid charges, no refund for uncertain/replacement writes,
the full 90-second schedule, early fault, late cleanup and clock/re-entry refusal.
These tests use real ledger threads and explicit clock inputs, not mocked provider
responses. They do not qualify blocked I/O, actual OS deadline delivery or all
hostile filesystem variants. Evidence hashes are local consistency checks, not
independent attestation or a replay of private diagnostics.

Luna and GLM completed supplied-context reviews; neither reviewed the final code
or ran the package inspection. [Review](review.json) records adopted findings and
the rejected suggestion to refund completed replacements. Gemini remained excluded
under the recorded consumer-route decision; fallback was unnecessary.

**Next:** integrate the shared metadata charges and schedule into a new supervised
composition, including observer/diagnostic persistence. Freeze the candidate's
actual effective configuration and permitted helper inventory, then review
L1/L2/P1/P2 before any separate U0 admission. Authenticated A0/T0 still needs the
applicable provider route and its own wire/effect contract.
