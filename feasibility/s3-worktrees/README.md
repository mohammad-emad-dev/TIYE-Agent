# S3 worktree feasibility prototype

This begins S3.1 with a disposable Windows Git fixture. `npm run probe` makes
no model requests and uses no remote repository. The probe creates a fresh
source root plus a separate worktree base, integration and two member branches.

`scripts/worktree-lifecycle.js` keeps a private ownership registry. Targets must
be new direct children of its canonical base outside the source root. Create
rejects existing targets and unsafe selections. Remove revalidates the target,
recorded branch, common Git directory and native worktree registry. It refuses
changed ownership, links, locks, active Git operations, tracked/untracked changes
and ignored artifacts. It does not force removal or delete branch refs.

`npm run check` uses real disposable Git to check refusal cases, including an
in-progress merge whose status is clean. The native probe measures three
worktree creations, one offline local dependency install, fixture settings copy,
concurrent Node writers, clean different-file merges and an exact same-file
conflict. Merge abort must restore the integration HEAD, tree and index tree.
Source-root file bytes, branch, HEAD, status and index bytes must remain unchanged;
new branch refs and worktree metadata inside `.git` necessarily change.

Setup uses the installed npm CLI beside Node, a fixture-local npm cache,
`--offline --ignore-scripts --no-audit --no-fund --global=false --install-links`.
Only one local file dependency is installed. Copied settings contain synthetic
fixture data. Generated member artifacts are removed only after worktree and
canonical target checks; nested links are rejected before recursive deletion.
Worktrees are then removed without force. Both exact temp directories are
removed only after the native registry contains the original source root alone.

`npm run probe:dependencies` compares separate `node_modules` folders using one
owned npm cache against a Windows junction to another owned member's modules.
Four disposable worktrees use local file packages and the same offline install
flags. Adding a package must execute successfully in the private member while
the donor's manifest, lock and installed file hashes remain unchanged. The
probe records whether npm preserves, replaces or mutates the junction target.
In the measured version npm replaced the junction with a private install.
An owned-link helper unlinks only a verified junction; a separate real-filesystem
test proves donor preservation and refusal of a foreign target.
Timings and logical bytes are observations, not a speedup or disk-saving claim.
See the content-addressed dependency evidence and qualification in `evidence/`.

`npm run probe:attribution` runs a Node child and an engine fixture through
native Git with explicit member author and fixture engine committer variables.
Each controlled member/merge commit carries one `Tiye-Session` trailer. The
audit reads actual commit metadata, message hashes and native parsed trailers;
it rejects missing/duplicate session trailers and an overridden author. Two
non-fast-forward merges must preserve member commit IDs and metadata.
The launch helper removes inherited `GIT_*` values before setting attribution.
Environment defaults are advisory: raw Git receives no automatic trailer, and
`--author` can override the configured author. Native provider CLI launches,
automatic trailer insertion and production commit orchestration remain open.

`npm run probe:cli-attribution` makes a model request to the authorized Muse
xhigh route. It launches OpenCode 2.0.28 in a private standalone server with
explicit attribution variables. A disposable copy of the installed OpenCode
relay adds only `--standalone`; the original skill and shared service stay intact.
The member runs one fixed `rtk proxy node attribution-task.cjs` shell command.
The worker checks native Git identities and canonical location, then edits one
fixture file. The parent checks the correlated completed shell event, exact
JSON output, file bytes, worker/task integrity and unchanged HEAD before making
the fallback commit itself. Raw native artifacts remain in an owned temp relay
directory for diagnostics; committed evidence contains only the bounded proof.
This qualifies this standalone CLI-to-shell path and parent fallback commit,
not the shared-service launch, CLI-created commits or automatic session trailers.

The lifecycle registry is in memory. Restart recovery, interprocess locking and
atomic protection against filesystem replacement remain unbuilt. Refusal is
conservative; uncertain cleanup retains the fixture. This prototype does not
contain arbitrary processes or qualify file ownership watching.

**Full S3 remains partial.** The bounded shared-cache comparison passes;
generic shared dependencies, real project setup, native CLI
attribution, push approval/bypasses, ownership watcher/revert, checkpoints,
approved final merge and the Windows compatibility matrix are still open.
See [the measured results](RESULTS.md).
