# Native package inventory and proposed startup profile

19 October 2026

Completed a passive Ubuntu inspection of the pinned Codex 0.157.1 package:
**44 files matched, with no missing or unexpected nodes** in the enumerated tree.
All seven fixed system/ancestor configuration probes were absent at inspection
time. Three Linux policy tests and two Windows publication tests pass in normal
and optimized modes. Codex itself was not executed by this inspection.

**Native admission remains denied.** L1/L2 are PARTIAL, P1/P2 OPEN, A1 BLOCKED
and Phase 1 HOLD. This closes the earlier listed-files-only inventory gap and
defines a source-derived helper policy. It does not resolve the actual effective
configuration or qualify native startup.

## Package and configuration observations

The new walker starts from held directory descriptors, opens every package path
component with no-follow semantics and uses the frozen inspector's hash routine
on each opened file. It derives the exact directory set from the 44 expected
relative file paths. Missing/extra directories or files, links, nonregular files,
foreign ownership, multiple file links, group/world write bits and setuid/setgid
bits are refused. Traversal is capped at 128 nodes, eight relative path components
and 4096 bytes per inventory path. Directory metadata is checked before and after
traversal; file identity/size/timestamps and digest are checked across reading.

These checks detect ordinary drift at inspection time. They do not establish
immutability against the same account, eliminate all races, assess POSIX ACLs,
prevent mount replacement or attest a reproducible upstream build. Ancestor paths
are opened without following links, but their full ACL/mount authority is outside
this package-content check. The expected hashes come from the retained package
inventory; matching them is not proof that the binary was built from reviewed
source.

Seven fixed probes use metadata only: the three `/etc/codex` config/requirements/
managed-config files and four conservative root/`/tmp` ancestor config locations.
No configuration contents, credential files or keyring were read. A symlink is
reported as a link rather than followed; inaccessible paths remain unresolved.
Absence is a point observation, not an enforced startup condition or a complete
configuration search. [Inspection](inspection.json) contains the exact fixed
path states and scope flags, with no account identifiers or private runtime paths.

## Source-derived startup policy

The review remains pinned to upstream commit
`36650394c5b38c2990ccf2a3457165ca3e9d9726`. Two additional public source files
cover package-layout detection and managed-config file loading. Their hashes and
the twelve earlier source hashes are recorded in [sources](sources.json).
Third-party source bodies remain in local cache, outside Git publication.

| Startup surface | Finding and proposed treatment |
| --- | --- |
| Dotenv | [arg0 startup](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/arg0/src/lib.rs#L306) reads `CODEX_HOME/.env` before helper setup; its filter excludes only `CODEX_` names. Require absence in the fresh runtime before and after startup; do not import a real account's dotenv |
| Final PATH | [Package layout](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/install-context/src/lib.rs#L286) can supply `codex-path`; [arg0](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/arg0/src/lib.rs#L179) then prepends the new alias directory. Initial `/usr/bin:/bin` is not the final PATH |
| Alias set | Exactly `apply_patch`, `applypatch`, `codex-linux-sandbox`, `codex-execve-wrapper` as symlinks to the pinned binary plus a regular empty `.lock`; no arbitrary symlink allowance |
| Alias lifecycle | Source uses a new `codex-arg0`-prefixed temporary directory under `CODEX_HOME/tmp/arg0`, held through main and normally removed afterward. An interrupted or partial inventory stays uncertain; no reused root or automatic deletion |
| System policy | [Managed file loading](https://github.com/openai/codex/blob/36650394c5b38c2990ccf2a3457165ca3e9d9726/codex-rs/config/src/loader/layer_io.rs) remains separate from user configuration. Preserve requirements/managed/cloud policy rather than bypass it |
| Auth and telemetry | The previously reviewed app-server constructs auth managers, cloud configuration loading, environment management and telemetry before RPC. File-store and analytics proposals are not proof of no credential discovery or network access |

[Profile](profile.json) freezes the proposed argv/environment and unresolved
evidence. It adds strict config validation and proposes file auth storage plus
analytics/feedback opt-out. These are source-supported proposals, not tested CLI
effects or universal auth/network disable switches. Requirements can govern
credential-store selection. This proposal differs from the old contract's bare
argv tail and therefore needs a separately reviewed final contract/admission.

The helper checker verifies a supplied directory's exact five-entry structure,
ownership, permissions, link target strings and lock metadata. Its tests create
synthetic helper directories under private temporary roots; they never invoke a
helper. It does not establish an actual generated session location, final PATH,
live binary inode binding, startup side effects or native helper cleanup. Those
remain startup-observation work, not credit from these synthetic fixtures.

## Verification and retention

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/native-inventory/inspect_windows.py
rtk proxy python -B -O -X utf8 feasibility/s6-wsl/native-inventory/inspect_windows.py --optimized-linux
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/native-inventory -p test_publication.py -v
rtk proxy python -B -X utf8 feasibility/s6-wsl/native-inventory/check.py
```

The first two commands inspect package bytes and run the three policy tests in
actual Ubuntu Python, normally and with `-O`. The tests cover exact helper sets,
missing/extra nodes, wrong/relative targets, lock links, writable files/root,
symlinks, FIFO refusal, multiple hardlinks and metadata-only config-link handling.
The two publication tests reject source/artifact/reference drift, private fields
and promotion to native/auth/network/configuration qualification. Those tests
also pass under optimized Windows Python. Default `check.py` is offline and does
not execute the candidate or connect to Ubuntu.

Windows diagnostics are drained in fixed chunks through protected metadata
storage with charge-before-write accounting. Overflow switches to discard and
fails the inspection; no successful output is published. The final selected JSON
is capped at 8 KiB. Raw diagnostics and attempted-source hashes stay in protected
LOCALAPPDATA storage; local `.git` files contain selected results and private-root
locators. Linux test fixtures contain only synthetic bytes and are removed after
tests. This passive inspector has its own 45-second process wait and teardown;
it is not the native shared-deadline composition or proof of bounded WSL process
tree cleanup. Unsettled drain handles are retained and failure is reported.

Luna completed the design review; GLM timed out and authorized DeepSeek fallback
completed. None reviewed final sources or ran this inspection. [Review](review.json)
records findings, adopted fixes and exclusions. Gemini remains excluded by the
recorded consumer-route decision. Historical source/evidence cohorts are intact.

**Next:** prepare the concrete source-bound startup observation composition for
the proposed initialize-only profile, including fresh-root inventories, actual
helper/PATH/configuration behavior and bounded runtime writes. Review that exact
composition for separate U0 admission. Model calls, account login and
authenticated provider eligibility remain outside this passive result.
