# S3.4 ownership watcher and recovery — 14 October 2026

**OWNERSHIP_PASS_S3_PARTIAL.** One disposable Windows worktree verified bounded
polling and reviewed per-file recovery with Git 2.55.0.windows.5 and Node
26.7.0. The parent supplied controlled fixture writes and simulated approval;
no provider CLI made these edits, and no actual user approval UI was exercised.

| Check | Observed result |
|---|---|
| Real polling | Modified member-b.txt, deleted shared.txt, added new-note.txt and modified initial untracked local-note.txt detected |
| Assigned file | member-a.txt edit was not flagged and stayed intact through all recovery |
| Reviewed recovery | Four privately bound approvals restored changed/deleted content and removed the new file |
| Stale target | An earlier approval refused a newer target edit; newer bytes remained until a fresh observation was approved |
| Untracked checkpoint | Original local-note.txt bytes restored from memory rather than HEAD |
| Refusal tests | Forged/replayed approval, staged index, changed HEAD, hardlink and junction substitution refused; foreign canary bytes preserved |
| Stop/fault | Polling closed; a link-induced snapshot fault latched and prevented recovery/restart |
| Cleanup and checks | Assigned fixture work committed only for cleanup, source state unchanged, clean owned worktree removed, registry root-only, owned roots gone; 15 S3 and 113 S2 checks passed |

The measured detection interval was **183 ms** in this tiny controlled run with
a 100 ms polling delay plus synchronous scan time. This is an observation, not
a latency guarantee or a production benchmark. The watcher snapshots ordinary
file bytes, skips `.git`, deduplicates pending file-state fingerprints, limits
the notification queue to 100, and fails closed on unverified snapshots.
Snapshot limits are 1 MiB per file, 1,000 regular files and 8 MiB total. Exact
assigned paths are copied at construction; globs and dynamic reassignment are
unsupported. Directory-only and file-mode changes are not qualified.

The [sealed observation](evidence/supplements/ownership/45fdade5a2dac89983411852384f379091b9855a70570dc3562707fdf272ee88/ownership.json)
and [qualification](evidence/ownership-qualification.json) bind the measured
source and versions. The first passing observation is separately retained;
the corrected run consumes approvals on every reviewed attempt, including a
refusal. Previous tracked S1/S2/S3 evidence remains unchanged.
The real-filesystem refusal test stages a fixture edit, changes its HEAD, and
substitutes a hardlink/junction to a separate fixture canary. It verifies refusal
before recovering or deleting foreign content. Test cleanup touches only its
known synthetic edits and exact owned paths.

This is **after-the-fact detection and fixture-approved recovery**, not write
prevention. Recovery compares the current target hash with the reviewed
observation and refuses changed checkpoint HEAD/index, unsafe paths and links.
Approval is consumed on the reviewed attempt; a refused attempt needs a fresh
observation and approval before retrying. Rejected writes are not silently
reset or unstaged. Initial untracked checkpoint bytes are preserved.
Closing only stops polling; it does not stop a CLI process. Writers must be
controlled before recovery. Filesystem rechecks are not atomic and do not
contain arbitrary processes. Edits between polls can be missed, and out-of-tree
writes or Git metadata changes are not covered by this watcher. Durable hidden
Git checkpoints, restart recovery, production routing/UI, provider CLI watcher
qualification and the Windows compatibility matrix remain open. Full S3 and
the core application remain partial.

Muse and Agy Gemini 3.8 Flash high completed supplied-facts reviews. MiMo Atria
timed out after four minutes; Claude Atria returned token quota exhaustion
(HTTP 429). Recursive MiMo/OpenCode/Claude event audits found zero tool events.
Agy's plain log lacks equivalent structured tool-event coverage; its status and
change tripwire are recorded in qualification. Concurrent parent edits were
reviewed before commit. Agy's replay concern prompted consumption on refused
recovery attempts as well as successful ones; its race concern remains an
explicit limitation rather than a containment claim.

## Earlier S3.3 local push policy — 14 October 2026

**PUSH_POLICY_PASS_S3_PARTIAL.** Git 2.55.0.windows.5 and Node 26.7.0 completed
the Windows push fixture with two owned worktrees and one local bare remote.
The parent performed these native Git operations; delegates did not push or
commit. Approval was a fixture simulation, not a human approval UI.

| Check | Observed result |
|---|---|
| Worktree hook scope | Member A used its own pre-push hook; member B retained the fixture's empty hooks path |
| No approval | Engine prototype refused request/forged approval objects; ordinary hooked Git push exited 1 and left the remote empty |
| Exact fixture approval | Hook permitted one matching grant; pinned SHA reached the exact remote ref |
| Replay and stale state | Consumed approval, changed source HEAD and changed remote tip were refused before another push |
| Non-fast-forward | Normal approval refused rewind; explicit force approval with a pinned lease succeeded |
| CLI-equivalent bypasses | --no-verify, core.hooksPath override and another unhooked worktree each changed the local remote without a hook log entry |
| Local ref visibility | Local refs were unchanged across the bypass sequence despite remote ref changes |
| Cleanup and checks | Source state unchanged, both clean worktrees removed, registry root-only, owned temp roots gone; 13 S3 and 113 S2 checks passed |

The engine prototype uses private request/approval bindings and constructs one
exact refspec itself. It compares the approved source and remote tips before
Git, consumes approval when starting the operation, uses an explicit
`--force-with-lease=<ref>:<expected-tip>`, and verifies the remote result. A
non-fast-forward source needs explicit force intent. Only a canonical local
bare target directly under the supplied fixture base is accepted. Global/system
Git configuration is disabled for push subprocesses and only file transport is
allowed, avoiding external URL rewrites or credential routes in this experiment.

The pre-push hook is **best-effort for CLI members**. Its per-process grant is
not a credential or same-user boundary. The bypass observations show why a
local file/ref watcher cannot promise to detect every remote mutation. No hook
or Git configuration was installed in the actual project checkout.

The current observation is [sealed](evidence/supplements/push-policy/dd08cff37fe9b951d4fda948833e51eb2568c4d5a4ea7d20d23dd86b27b9945e/push-policy.json),
with [qualification](evidence/push-policy-qualification.json). The initial failed
observation remains separate: an approved grant comparison mixed shell-forward
slashes with a canonical Windows path. The corrected hook canonicalizes that
argument. Its first passing rerun is also retained; the final run adds config/
transport isolation and strict hook-log/source-integrity evidence requirements.
Source hashes, archive bytes and prior tracked S1/S2/S3 evidence were verified.

Git documents [pre-push invocation](https://git-scm.com/docs/githooks),
[leases and hook bypass](https://git-scm.com/docs/git-push), and
[worktree configuration](https://git-scm.com/docs/git-worktree).
This is a bounded local fixture, not a production push broker. Actual user
approval, durable effects/recovery, authenticated network remotes, provider CLI
push participation, protected-branch rules and OS/credential containment remain
unqualified. Full S3, the core engine and production UI remain partial.

Muse and Agy Gemini 3.8 Flash high completed supplied-facts reviews. MiMo Atria
timed out after four minutes; Claude Atria returned token quota exhaustion
(HTTP 429). Recursive MiMo/OpenCode/Claude audits found zero tool events. Agy's
plain log lacks equivalent structured tool-event coverage; its outcome and
change tripwire are recorded in qualification. Parent changes were reviewed
before commit. Agy's mandatory format-version-1 advice was rejected: Git's
[configuration documentation](https://git-scm.com/docs/git-config#Documentation/git-config.txt-extensionsworktreeConfig)
states worktreeConfig is respected regardless of repositoryFormatVersion.
Replay protection belongs to the engine approval map; the hook's environment
grant is not a durable one-use capability. The stale-remote case is rejected by
the engine precheck; no race during transport is qualified by that observation.

## Earlier S3.2 session-trailer policy — 14 October 2026

**TRAILER_POLICY_PASS_S3_PARTIAL.** The disposable Windows fixture now has an
integration gate that audits the complete introduced member range before its
controlled merge. Git was 2.55.0.windows.5 and Node 26.7.0. The parent generated
these synthetic histories; no provider CLI was asked to commit or push.

| Check | Observed result |
|---|---|
| Invalid earlier commit behind a valid tip | Full range rejected; integration HEAD, files, index tree and status unchanged |
| Trailer and identity errors | Missing, duplicate, foreign-session and foreign-author commits classified and refused |
| Forged audit result | Copying an eligible result could not authorize merge; private decision binding required |
| Stale heads | Changing either member or integration HEAD blocked the previous decision without a merge |
| Dirty/active state | Owned dirty-file and Git-operation-marker controls blocked merge |
| Valid range | Exact inspected SHA merged without fast-forward; merge parent order, engine trailer, file bytes and member metadata matched |
| History and cleanup | Rejected history unchanged, source state unchanged, three clean worktrees removed, registry root-only and owned temp roots gone |
| Offline verification | Eleven S3 checks plus existing 113 S2 checks pass |

The policy is **audit and reject, without silently rewriting member history**.
The fixture requires expected member author, synthetic engine committer and
exactly one matching raw and Git-parsed `Tiye-Session` line on every supported
introduced commit. Rejected history stays on its member branch. Production
resolution UI and task routing are not implemented.

Native range tests also cover empty ranges, 51 introduced commits, non-linear
member history, a base outside integration ancestry, wrong gate session and
already-integrated work. A consumed decision stays unusable even if the fixture
integration ref is subsequently returned to its old value. Decisions are in
memory and are consumed immediately before Git starts; uncertain failures need
fresh inspection. The gate does not install hooks or automatic trailer insertion.

The current observation is [sealed](evidence/supplements/trailer-policy/d0e7de2acbe92995354da364ef23c9af8edcb950ca57071505ad1d60d1b2e77e/trailer-policy.json),
with [qualification](evidence/trailer-policy-qualification.json). Earlier passing
observations remain separate: they preceded the already-integrated/session
selection checks, decision consumption and sequencer-state refusal. Current source hashes, versions
and prior tracked S1/S2/S3 evidence bytes were checked.

The implementation uses Git's [complete range traversal](https://git-scm.com/docs/git-rev-list)
and [ancestor checks](https://git-scm.com/docs/git-merge-base). It supports at
most 50 introduced single-parent commits; unsupported history is refused.
Checks before merge are not atomic concurrency protection. A post-merge parent
mismatch or Git error is an unverified outcome, not permission to retry or reset
history. Durable transaction records, locks, conflict recovery in this gate,
actual provider-created commit qualification and final user-approved merge
remain open. This gate does not prevent a CLI from invoking Git directly.
The earlier standalone CLI propagation result is unchanged. Full S3, the core
engine and production UI remain partial.

Muse and the requested Agy Gemini 3.8 Flash high fallback completed supplied-facts
reviews. MiMo Atria timed out after four minutes; Claude Atria returned token
quota exhaustion (HTTP 429). Recursive event audits found zero tool events on
MiMo/OpenCode/Claude. Agy's plain log does not provide equivalent structured
tool-event coverage; its status, final review and change tripwire are recorded
in qualification. Concurrent parent implementation changes were reviewed before
commit. Agy's sequencing/race concerns informed marker refusal and the explicit
non-atomic limitation; no durable lock or concurrency guarantee is claimed.

## Earlier S3.2 native CLI propagation — 14 October 2026

**CLI_ATTRIBUTION_PASS_S3_PARTIAL.** OpenCode 2.0.28, requested with the Muse
spark 1.3 free route at xhigh, ran a fixed task in one disposable Windows
worktree. Its shell inherited the member author and fixture engine committer;
native `git var` matched both identities. Git was 2.55.0.windows.5 and Node
26.7.0. The delegate edited one synthetic file; only the parent committed it.

| Check | Observed result |
|---|---|
| Native CLI tool | Exactly one completed shell event in the owned session, exact command and JSON output, exit 0 and no truncation |
| Native Git identity | Expected member author and distinct fixture engine committer reached the shell/Git process |
| Task and worker integrity | Expected content written; worker hash and task bytes unchanged; only expected fixture paths changed |
| Commit boundary | CLI HEAD unchanged; parent fallback commit matched author, committer, session trailer and original parent |
| Cleanup | Clean worktree removed without force; original source state unchanged; registry root-only and owned fixture roots removed |
| Verification | Nine S3 checks and existing 113 S2 checks pass |

The installed relay has no standalone flag, so the probe creates a disposable
copy with exactly one verified argument-list replacement adding `--standalone`.
Both relay source hashes are recorded. No installed skill, global configuration
or protected shared OpenCode service was modified. Standalone mode matters here:
this experiment establishes environment propagation through a fresh private
server, not through the existing shared service.

The latest run is [sealed](evidence/supplements/cli-attribution/4e2e647fa95120339db244271b13f3d9ea1b9758e6b607fe0f6cb2798a4312e2/cli-attribution.json),
with [qualification](evidence/cli-attribution-qualification.json). An earlier
passing run is retained. The final evidence gate additionally requires the
captured native tool proof and rejects foreign sessions, extra tools, failed or
truncated output, prose echoes, unknown CLI versions and incomplete cleanup.
Source hashes, sealed bytes and previous tracked S1/S2/S3 evidence were checked.

Two failed observations remain archived. The first used `--pure`, absent from
this native version's help, and failed before a task; cleanup removed its raw
relay diagnostics, so only its summary remains. The second executed the worker
successfully but was rejected by an outdated `bash` tool expectation: this
version emits `shell`. Its dirty fixture was retained on refusal. After auditing
the known task, the parent restored only its synthetic member-a edit and removed
the clean worktree without force; the separate cleanup record is retained.
The passing reruns use the observed version-specific shell schema. No failed
record was rewritten into a pass. Raw native artifacts for later runs remain
outside Git; credentials and provider response bodies are not copied into evidence.

This is **CLI environment propagation plus a parent fallback commit**.
Provider-created commits, arbitrary commit trailer insertion, trusted author
identity, durable task/commit binding, production launch adapters and full S3
remain unqualified. Native CLI participation does not make these metadata
defaults enforceable. The core engine and full product UI remain unbuilt.

MiMo Atria timed out after four minutes; Claude Atria returned token quota
exhaustion (HTTP 429). Their recursive native event audits found zero tool
events. Muse performed the one qualified fixture shell call. The requested Agy
Gemini 3.8 Flash high fallback completed its supplied-facts review; its
working-tree tripwire observed concurrent parent edits, and its plain log does
not provide equivalent structured
tool-event coverage. Its prune suggestion was unnecessary because the owned
non-force removal already left the registry root-only. Claude's change tripwire
observed parent implementation edits, which were reviewed before committing.

## Earlier S3.2 attribution baseline — 14 October 2026

**ATTRIBUTION_BASELINE_PASS_S3_PARTIAL.** Native Git 2.55.0.windows.5 with
Node 26.7.0 completed the metadata experiment in three disposable Windows
worktrees. One Node child made a member commit; an engine fixture committed
the other member's work. These are synthetic processes, not provider CLI tasks.

| Check | Observed result |
|---|---|
| Member author, distinct committer | Both member commits matched their expected author and fixture engine committer |
| Session association | Exactly one matching raw and Git-parsed Tiye-Session trailer on controlled member and merge commits |
| Integration history | Two non-fast-forward merges retained exact member IDs, metadata and message hashes; parent order and merged file bytes matched |
| Raw member commit | Identity environment did not insert a trailer; audit rejected the missing session |
| Duplicate session trailers | Native parser returned both; audit rejected the commit |
| Author override | Native --author changed the author despite launch defaults; audit rejected the mismatch |
| Cleanup | Three clean worktrees removed without force, source state unchanged, registry root-only and exact temp roots removed |
| Verification | Seven S3 checks and the existing 113 S2 checks pass |

The launch helper clears inherited Git routing, identity and configuration
environment values, then sets explicit author/committer defaults. Identity inputs
reject control characters and unsafe member/session IDs. Metadata reads use
NUL-separated fields and native trailer parsing, with a separate raw-line count
to avoid accepting duplicate session lines after normalization.

The final observation is [sealed by content hash](evidence/supplements/attribution/edf58203629aa397d3b49af52c6513bba9cf8cb78da9fbb5fa2c745c346ffc20/attribution.json).
An earlier passing observation is retained separately: it preceded merge
session trailers, raw trailer counts and message hashes. Only the corrected
observation qualifies the current implementation. See
[qualification](evidence/attribution-qualification.json) for source/version
bindings and delegate outcomes. All previous tracked S1/S2/S3 evidence bytes
remain unchanged.

This supports inspectable Git metadata, **not trusted identity enforcement**.
Git documents author/committer [environment defaults](https://git-scm.com/docs/git),
the [author override and explicit trailer options](https://git-scm.com/docs/git-commit),
and [native trailer parsing](https://git-scm.com/docs/git-interpret-trailers).
CLI adapter environment propagation, trailer insertion for arbitrary CLI
commits, and binding commits to durable session/task records remain unbuilt.
The experiment installs no attribution hooks and changes no user Git settings.
Full S3 and the application/core engine remain partial.

Muse and the requested Agy Gemini 3.8 Flash high fallback completed their
supplied-facts reviews. MiMo Atria timed out after four minutes; Claude Atria
returned token quota exhaustion (HTTP 429). Recursive event audits found zero
tool events on MiMo/OpenCode/Claude. Agy 1.3.5 returned a nonempty review and
reported no working-tree violation; its plain log has no observed tool markers,
but it provides no equivalent structured tool-event coverage. Claude's tripwire
observed the parent's edits, which were reviewed before committing.
Agy's suggestion to force-remove and prune worktrees was rejected: owned native
removal without force already passed. Its environment-preservation advice is
covered by retaining non-Git platform variables, and NUL metadata reads use
native subprocess arguments rather than a shell.

## Earlier S3.1 dependency comparison — 14 October 2026

**COMPARISON_PASS_S3_PARTIAL.** Four disposable Windows worktrees compared
independent `node_modules` with a shared npm cache, a separate-cache reference,
and a direct junction to the donor's modules. Git 2.55.0.windows.5, Node 26.7.0
and npm 11.19.0 performed the offline local-package experiment.

| Check | Observed result |
|---|---|
| Independent folders, shared cache | New package installed and executed; donor manifest, lock and installed hashes unchanged |
| Direct modules junction | npm replaced it with a private install; new package executed and donor stayed unchanged |
| Logical dependency bytes | 328 per baseline install; 538 in the borrower after its addition |
| Install times | Cold shared cache 362 ms; warm shared cache 341 ms; separate cache 334 ms; private addition 340 ms; junction addition 344 ms |
| Cleanup | Four worktrees removed, original source state unchanged, registry root-only, both owned temp roots gone |
| Verification | Four S3 checks and all existing 113 S2 checks pass |

The candidate policy is **independent dependency folders with one npm cache**.
The direct junction did not remain shared during this install. These local file
packages do not measure remote package caching, realistic application setup,
allocated disk space or statistical speedup. No generic shared-dependency
qualification or isolation guarantee is established.

The latest observation is [sealed by content hash](evidence/supplements/dependencies/14f0e6283a881100d6fee707a020a19f15032e49e8117b42121e3c5dfc5603e7/dependencies.json),
with [qualification](evidence/dependencies-qualification.json). Earlier passing
observations remain archived. The latest run includes explicit borrower runtime
verification and a stricter evidence gate; missing private-install, donor or
cleanup proof cannot pass. Measured source hashes and all prior tracked
S1/S2/S3 evidence bytes were verified.

In the native experiment npm had already replaced the junction, so the owned
unlink helper was not invoked there. A separate real-filesystem test verifies
that helper against an owned donor and a foreign target, preserving both targets'
bytes and refusing the foreign link before deletion. Cleanup revalidates owned
worktrees and canonical boundaries; unknown links retain the fixture.

Muse completed its supplied-facts review. MiMo Atria timed out after four minutes;
Claude Atria returned token quota exhaustion (HTTP 429). The authorized Gemini
fallback at high effort failed with `provider.quota` / HTTP 402. Recursive native
event audits found zero tool events on all four routes. Claude's concurrent
change tripwire observed parent edits, which the parent reviewed before commit.
Full S3, the core application and production UI remain unfinished.

## Earlier S3.1 baseline — 14 October 2026

**BASELINE_PASS_S3_PARTIAL.** Native Git/npm and two simple Node writer processes
completed the bounded baseline on Windows with Git 2.55.0.windows.5, Node
26.7.0 and npm 11.19.0. No provider CLI performed these fixture edits or commits.
The corrected setup completed in **616 ms**, meeting the initial 60-second
target for this tiny local fixture; installed dependency files totaled **328
logical bytes**. Two S3 offline checks and the existing 113 S2 checks pass.

| Check | Observed result |
|---|---|
| Integration plus two member worktrees | Three new branches/worktrees outside the source root; common Git metadata matched |
| Setup | Offline install of one local file dependency plus Node test passed; timing below |
| Synthetic untracked settings | Copied byte for byte into member A and consumed by its passing test |
| Distinct-file edits | Two concurrent Node writers completed; both exact files committed and merged into integration |
| Same-file edits | Conflicting replacement of the same line; merge exited 1 and listed only shared.txt as unmerged |
| Abort | Integration HEAD, file hashes and index tree restored to the pre-conflict state |
| Original source root | File hashes, branch, HEAD, status and index bytes unchanged; new refs/worktree metadata excluded from this claim |
| Cleanup | Generated fixture artifacts removed with boundary/link checks; all three worktrees removed without force; registry root-only and both exact temp directories gone |

The first passing observation was sealed before adding active-Git-operation
refusal and a writer timeout. The corrected probe was run and sealed separately.
The corrected observation is
[sealed by content hash](evidence/supplements/basics/ec3e80f81c93a254a90207ca086c54379c10edb0f3f67dc7052153289d865afb/basics.json),
with [qualification and delegation outcomes](evidence/basics-qualification.json).
The first observation is separately retained. Both manifests record the exact
Git/Node/npm versions. Current measured source hashes and previous S1/S2
evidence/capability bytes were verified.
The real-Git refusal test covers escaped/existing targets, foreign root removal,
uncommitted changes, changed branch ownership and a merge in progress even when
porcelain status is clean. Its first extended run lacked fixture-local committer
identity; that test setup was corrected without changing user Git configuration.

The setup fixture installs `file:vendor/local-helper`. `--install-links` packs
it into ordinary dependency files rather than leaving a junction, consistent
with [npm's documented option](https://docs.npmjs.com/cli/v11/commands/npm-install/).
The measured installed bytes are logical file sizes, not allocated disk usage.
Setup is deliberately small and offline; its timing does not qualify network
installs, larger repositories or a shared-dependency design.

Lifecycle removal follows the native registration model described in
[Git's worktree documentation](https://git-scm.com/docs/git-worktree). Conflicts
are inspected before [merge abort](https://git-scm.com/docs/git-merge) restores
the fixture. No final integration-to-source merge, user remote, push or force
cleanup is performed.

## Remaining gates

S3.1 step 3 now has a bounded dependency comparison; generic shared dependencies,
real project setup and the Windows long-path/case/file-lock matrix remain open. S3.2 provider CLI integration and durable attribution,
S3.3 push approval and hook bypass, S3.4 watcher/revert, S3.5 checkpoints and
S3.6 approved final merge have not been qualified here. Full S1/S2 also remain
partial; this independent S3 fixture does not close them or permit release.
The core application, durable lifecycle registry and production UI remain unbuilt.

Worktrees separate ordinary file edits. They do not supply per-member native
saved-approval isolation, prevent arbitrary out-of-worktree writes or establish
OS containment. The earlier S2 shared-project observation remains applicable.

Muse completed its supplied-facts review. Both Atria routes timed out after
four minutes. The authorized Gemini 3.8 flash fallback, requested at high
effort, failed before a final review with `provider.quota` / HTTP 402. Recursive
event audits found zero tool events on all four routes. Claude's concurrent
change tripwire saw the parent's implementation edits; the parent reviewed
the full diff before committing.
