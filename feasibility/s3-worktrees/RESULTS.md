# S3.1 baseline result — 14 October 2026

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

S3.1 step 3 (shared dependencies and install mutations), real project setup and
the Windows long-path/case/file-lock matrix remain open. S3.2 attribution,
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
